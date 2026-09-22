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
import { applyExerciseIds, EXERCISES, makeSession, normalizePlan, replaceExercise } from "./lib/program";
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
  const session = completed?.status === "complete" ? completed : data.drafts[selectedDate] || completed || (data.plan && data.intake ? makeSession(data.plan, data.intake, data.history, selectedDate) : null);
  const todayDate = localDateKey();
  const todaySession = data.history.find((item) => item.date === todayDate) || data.drafts[todayDate] || (data.plan && data.intake ? makeSession(data.plan, data.intake, data.history, todayDate) : null);
  const updateSession = (next) => setData((current) => ({ ...current, drafts: { ...current.drafts, [selectedDate]: next } }));

  const generateProposal = async (payload) => {
    const response = await fetch("/api/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, history: data.history }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "AI 계획을 만들지 못했습니다.");
    return { ...result, plan: normalizePlan(result.plan, payload.intake) };
  };

  const saveInitialPlan = (intake, proposal) => {
    const plan = { ...normalizePlan(proposal.plan, intake), version: (data.plan?.version || 0) + 1 };
    const draft = applyExerciseIds(makeSession(plan, intake, data.history, selectedDate), proposal.exerciseIds || [], intake, plan);
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
        drafts: { ...current.drafts, [selectedDate]: applyExerciseIds(session, proposal.exerciseIds || [], current.intake, current.plan) },
        revisions: [...current.revisions, note],
      }));
      return;
    }
    const nextIntake = scope === "goal" ? { ...data.intake, goal: proposal.plan.goalSummary } : data.intake;
    const plan = { ...normalizePlan(proposal.plan, nextIntake), version: (data.plan?.version || 1) + 1 };
    const draft = applyExerciseIds(makeSession(plan, nextIntake, data.history, selectedDate), proposal.exerciseIds || [], nextIntake, plan);
    setData((current) => ({
      ...current,
      intake: nextIntake,
      plan,
      drafts: { [selectedDate]: draft },
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
    if (profileOpen) return <ProfileScreen intake={data.intake} plan={data.plan} session={session} revisions={data.revisions} configured={configured} initialSection={profileInitialSection} onGenerate={generateProposal} onApplyRevision={applyRevision} onEditIntake={() => setEditingIntake(true)} onBack={() => { setProfileOpen(false); setProfileInitialSection(null); }} />;
    if (activeTab === "home") return <HomeScreen selectedDate={selectedDate} setSelectedDate={setSelectedDate} session={session} todaySession={todaySession} history={data.history} drafts={data.drafts} todayDate={todayDate} plan={data.plan} onStartWorkout={startWorkout} onOpenRoutine={() => { setSelectedDate(todayDate); setRoutineOpen(true); }} />;
    if (activeTab === "workout") return <WorkoutScreen mode={workoutMode} setMode={setWorkoutMode} session={session} plan={data.plan} onChange={updateSession} onChangeType={(type) => updateSession(makeSession(data.plan, data.intake, data.history, selectedDate, type))} onFinish={finishSession} onEditSession={() => setRoutineOpen(true)} onOpenProgram={() => { setProfileInitialSection("program"); setProfileOpen(true); }} onBackHome={() => setActiveTab("home")} />;
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
            {routineOpen && session && <Modal title="오늘 운동 수정" onClose={() => setRoutineOpen(false)}>
              <p className="sheet-description">오늘 운동에만 적용됩니다. 종목을 직접 바꿀 수 있습니다.</p>
              <div className="routine-edit-list">
                {session.exercises.map((exercise, index) => <div key={`${exercise.id}-${index}`}>
                  <span>{index + 1}</span>
                  <select aria-label={`${index + 1}번 운동 교체`} value={exercise.id} onChange={(event) => updateSession(replaceExercise(session, index, event.target.value))}>
                    {EXERCISES.filter((option) => (option.equipment === "맨몸" || data.intake.equipment.includes(option.equipment)) && (option.id === exercise.id || !session.exercises.some((item) => item.id === option.id))).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                  <button aria-label={`${exercise.name} 제외`} onClick={() => updateSession({ ...session, exercises: session.exercises.filter((_, at) => at !== index) })}>×</button>
                </div>)}
              </div>
              <div className="add-exercise-row"><select aria-label="추가할 운동" value={newExerciseId} onChange={(event) => setNewExerciseId(event.target.value)}><option value="">운동 선택</option>{EXERCISES.filter((option) => (option.equipment === "맨몸" || data.intake.equipment.includes(option.equipment)) && !session.exercises.some((item) => item.id === option.id)).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select><button className="secondary-button" disabled={!newExerciseId} onClick={() => { const item = EXERCISES.find((option) => option.id === newExerciseId); if (item) updateSession({ ...session, exercises: [...session.exercises, { ...item, completedSets: [] }] }); setNewExerciseId(""); }}>추가</button></div>
              <button className="primary-button" onClick={() => setRoutineOpen(false)}>오늘 구성 저장</button>
            </Modal>}
          </>
        )}
      </div>
    </main>
  );
}
