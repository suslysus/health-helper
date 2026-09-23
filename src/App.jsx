import { useEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import BottomNav from "./components/BottomNav";
import HomeScreen from "./components/HomeScreen";
import WorkoutScreen from "./components/WorkoutScreen";
import MealScreen from "./components/MealScreen";
import RecoveryScreen from "./components/RecoveryScreen";
import ProfileScreen from "./components/ProfileScreen";
import OnboardingScreen from "./components/OnboardingScreen";
import Modal from "./components/Modal";
import { applyExerciseIds, availableExercises, EXERCISES, makeSession, normalizePlan, replaceExercise } from "./lib/program";
import { loadAppData, saveAppData } from "./lib/storage";

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function App() {
  const [data, setData] = useState(loadAppData);
  const [configured, setConfigured] = useState(false);
  const [activeTab, setActiveTab] = useState("home");
  const [selectedDate, setSelectedDate] = useState(localDateKey);
  const [workoutMode, setWorkoutMode] = useState("overview");
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileInitialSection, setProfileInitialSection] = useState(null);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [editingIntake, setEditingIntake] = useState(false);
  const [newExerciseId, setNewExerciseId] = useState("");
  const contentRef = useRef(null);

  useEffect(() => { saveAppData(data); }, [data]);
  useEffect(() => {
    fetch("/api/status").then((response) => response.json()).then((status) => setConfigured(status.configured)).catch(() => setConfigured(false));
  }, []);
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [activeTab, workoutMode, profileOpen, editingIntake]);

  const completed = data.history.find((item) => item.date === selectedDate);
  const session = completed?.status === "complete" ? completed : data.drafts[selectedDate] || completed || (data.plan && data.intake ? makeSession(data.plan, data.history, selectedDate) : null);
  const todayDate = localDateKey();
  const todayRecorded = data.history.find((item) => item.date === todayDate);
  const todaySession = todayRecorded?.status === "complete" ? todayRecorded : data.drafts[todayDate] || todayRecorded || (data.plan && data.intake ? makeSession(data.plan, data.history, todayDate) : null);
  const availableForSession = session?.context ? availableExercises(session.context, data.plan) : EXERCISES;
  const updateSession = (next) => setData((current) => ({ ...current, drafts: { ...current.drafts, [selectedDate]: next } }));

  const saveLocation = ({ id, name, equipment }) => {
    const saved = { id: id || `place-${crypto.randomUUID()}`, name: name.trim(), equipment: [...new Set(equipment)], ready: true };
    setData((current) => ({
      ...current,
      locations: id ? current.locations.map((item) => item.id === id ? saved : item) : [...current.locations, saved],
    }));
  };

  const parseLocation = async (description) => {
    const response = await fetch("/api/location", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ description }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "장소 설명을 정리하지 못했습니다.");
    return result;
  };

  const prepareSession = ({ type, durationMinutes, locationId }) => {
    const location = data.locations.find((item) => item.id === locationId);
    if (!location?.ready || !durationMinutes) return;
    const context = { durationMinutes: Number(durationMinutes), locationId, locationName: location.name, equipment: [...new Set(["맨몸", ...location.equipment])] };
    const draft = makeSession(data.plan, data.history, selectedDate, type, context);
    setData((current) => ({
      ...current,
      drafts: { ...current.drafts, [selectedDate]: draft },
    }));
  };

  const generateProposal = async (payload) => {
    const response = await fetch("/api/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, history: data.history }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "AI 계획을 만들지 못했습니다.");
    return { ...result, plan: normalizePlan(result.plan, payload.intake) };
  };

  const saveInitialPlan = (intake, proposal) => {
    const plan = { ...normalizePlan(proposal.plan, intake), version: (data.plan?.version || 0) + 1 };
    const draft = makeSession(plan, data.history, selectedDate);
    setData((current) => ({
      ...current,
      intake,
      plan,
      drafts: { [selectedDate]: draft },
      revisions: [...current.revisions, { at: new Date().toISOString(), scope: "goal", summary: plan.changeSummary }],
    }));
    setEditingIntake(false);
    setProfileOpen(false);
    setActiveTab("home");
  };

  const applyRevision = (proposal, scope) => {
    const note = { at: new Date().toISOString(), scope, summary: proposal.plan.changeSummary || proposal.explanation };
    if (scope === "today") {
      setData((current) => ({
        ...current,
        drafts: { ...current.drafts, [selectedDate]: applyExerciseIds(session, proposal.exerciseIds || [], current.plan) },
        revisions: [...current.revisions, note],
      }));
      return;
    }
    const nextIntake = scope === "goal" ? { ...data.intake, goal: proposal.plan.goalSummary } : data.intake;
    const plan = { ...normalizePlan(proposal.plan, nextIntake), version: (data.plan?.version || 1) + 1 };
    const started = session?.exercises.some((item) => item.completedSets?.length);
    const keepToday = scope === "ongoing" || started || session?.status === "complete";
    const draft = keepToday ? session : applyExerciseIds(makeSession(plan, data.history, selectedDate, null, session?.context), proposal.exerciseIds || [], plan);
    setData((current) => ({
      ...current,
      intake: nextIntake,
      plan,
      drafts: keepToday ? current.drafts : { ...current.drafts, [selectedDate]: draft },
      revisions: [...current.revisions, note],
    }));
  };

  const finishSession = (finished, status = "complete") => {
    const saved = { ...finished, status, completedAt: new Date().toISOString() };
    setData((current) => {
      const drafts = { ...current.drafts };
      delete drafts[selectedDate];
      return { ...current, drafts, history: [...current.history.filter((item) => item.date !== selectedDate), saved] };
    });
    setWorkoutMode("overview");
    setActiveTab("home");
  };

  const startWorkout = () => {
    setSelectedDate(localDateKey());
    setActiveTab("workout");
    setWorkoutMode("prepare");
  };

  const renderScreen = () => {
    if (profileOpen) return <ProfileScreen intake={data.intake} plan={data.plan} session={session} locations={data.locations} onSaveLocation={saveLocation} onParseLocation={parseLocation} revisions={data.revisions} configured={configured} initialSection={profileInitialSection} onGenerate={generateProposal} onApplyRevision={applyRevision} onEditIntake={() => setEditingIntake(true)} onBack={() => { setProfileOpen(false); setProfileInitialSection(null); }} />;
    if (activeTab === "home") return <HomeScreen selectedDate={selectedDate} setSelectedDate={setSelectedDate} session={session} todaySession={todaySession} history={data.history} drafts={data.drafts} todayDate={todayDate} plan={data.plan} onStartWorkout={startWorkout} onOpenRoutine={() => { setSelectedDate(todayDate); if (todaySession?.exercises.length) setRoutineOpen(true); else startWorkout(); }} />;
    if (activeTab === "workout") return <WorkoutScreen mode={workoutMode} setMode={setWorkoutMode} session={session} plan={data.plan} locations={data.locations} onPrepareSession={prepareSession} onManageLocations={() => { setProfileInitialSection("gym"); setProfileOpen(true); }} onChange={updateSession} onFinish={finishSession} onEditSession={() => setRoutineOpen(true)} onOpenProgram={() => { setProfileInitialSection("program"); setProfileOpen(true); }} onBackHome={() => setActiveTab("home")} />;
    if (activeTab === "meal") return <MealScreen />;
    return <RecoveryScreen />;
  };

  const sessionActive = activeTab === "workout" && workoutMode === "active";
  const onboarding = !data.plan || editingIntake;

  return (
    <main className="app-shell">
      <div className="phone-frame">
        {onboarding ? (
          <div className="app-content onboarding-content"><OnboardingScreen key={editingIntake ? "edit" : "first"} initialIntake={editingIntake ? data.intake : null} configured={configured} onGenerate={generateProposal} onComplete={saveInitialPlan} onCancel={editingIntake ? () => setEditingIntake(false) : undefined} /></div>
        ) : (
          <>
            {!profileOpen && !sessionActive && <header className="app-header">
              <button className="brand" onClick={() => setActiveTab("home")} aria-label="홈으로 이동"><span className="brand-mark">H</span><span>HealthLog</span></button>
              <button className="profile-button" onClick={() => { setSelectedDate(todayDate); setProfileInitialSection(null); setProfileOpen(true); }} aria-label="프로필 열기"><UserRound size={19} /></button>
            </header>}
            <div ref={contentRef} className={sessionActive ? "app-content session-content" : "app-content"}>{renderScreen()}</div>
            <BottomNav active={activeTab} onChange={(tab) => { setProfileOpen(false); if (tab === "workout") setSelectedDate(localDateKey()); setActiveTab(tab); }} hidden={profileOpen || sessionActive} />
            {routineOpen && session?.exercises.length > 0 && <Modal title="오늘 운동 수정" onClose={() => setRoutineOpen(false)}>
              <p className="sheet-description">오늘 운동에만 적용됩니다. 종목을 직접 바꿀 수 있습니다.</p>
              <div className="routine-edit-list">
                {session.exercises.map((exercise, index) => <div key={`${exercise.id}-${index}`}>
                  <span>{index + 1}</span>
                  <select aria-label={`${index + 1}번 운동 교체`} disabled={Boolean(exercise.completedSets?.length)} value={exercise.id} onChange={(event) => updateSession(replaceExercise(session, index, event.target.value))}>
                    {availableForSession.filter((option) => option.id === exercise.id || !session.exercises.some((item) => item.id === option.id)).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                  <button aria-label={`${exercise.name} 제외`} disabled={Boolean(exercise.completedSets?.length)} onClick={() => updateSession({ ...session, exercises: session.exercises.filter((_, at) => at !== index) })}>×</button>
                </div>)}
              </div>
              <div className="add-exercise-row"><select aria-label="추가할 운동" value={newExerciseId} onChange={(event) => setNewExerciseId(event.target.value)}><option value="">운동 선택</option>{availableForSession.filter((option) => !session.exercises.some((item) => item.id === option.id)).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select><button className="secondary-button" disabled={!newExerciseId} onClick={() => { const item = EXERCISES.find((option) => option.id === newExerciseId); if (item) updateSession({ ...session, exercises: [...session.exercises, { ...item, completedSets: [] }] }); setNewExerciseId(""); }}>추가</button></div>
              <button className="primary-button" onClick={() => setRoutineOpen(false)}>오늘 구성 저장</button>
            </Modal>}
          </>
        )}
      </div>
    </main>
  );
}
