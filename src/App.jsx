import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import BottomNav from "./components/BottomNav";
import HomeScreen from "./components/HomeScreen";
const RunningScreen = lazy(() => import("./components/RunningScreen"));
const MealScreen = lazy(() => import("./components/MealScreen"));
const WorkoutScreen = lazy(() => import("./components/WorkoutScreen"));
const ProfileScreen = lazy(() => import("./components/ProfileScreen"));
const OnboardingScreen = lazy(() => import("./components/OnboardingScreen"));
import Modal from "./components/Modal";
import { applyExerciseIds, createPlannedExercise, availableExercises, BACK_PATTERN_LABELS, EXERCISES, makeSession, normalizeIntake, normalizeLocationEquipment, normalizePlan, replaceExercise, replacementOptions, SPLITS, withSessionTimeBudget } from "./lib/program";
import { hasStartedSession, loadAppData, saveAppData } from "./lib/storage";
import { analyzeMealPhoto as analyzeMealPhotoWithAI, estimateMeal as estimateMealWithAI, generatePlan, interpretTrainingRules, interpretCheckin as interpretCheckinWithAI, parseLocation as parseLocationWithAI, readApiKey, writeApiKey } from "./lib/ai";
import { normalizeTrainingRules } from "./lib/trainingRules";
import { postponeWorkout, undoWorkoutPostponement } from "./lib/schedule";
import { runningRecommendation } from "./lib/running";
import { createRunningTracker } from "./lib/nativeRunning";
import { sessionWithCurrentLocation } from "./lib/workoutLocation";

import { localDateKey } from "./lib/dates";
import { normalizeWorkoutSession } from "./lib/workoutHistory";
import { sessionForDate as resolveSessionForDate } from "./lib/workoutState";

const UI_STATE_KEY = "health-helper-ui-v1";

function loadUiState() {
  try {
    return JSON.parse(localStorage.getItem(UI_STATE_KEY)) || {};
  } catch {
    return {};
  }
}

export default function App() {
  const [data, setData] = useState(loadAppData);
  const [initialUi] = useState(loadUiState);
  const restorableWorkout = initialUi.activeTab === "workout"
    && initialUi.workoutMode === "active"
    && Boolean(data.drafts?.[initialUi.selectedDate]?.activeStartedAt);
  const restorableRunning = initialUi.activeTab === "running" && Boolean(data.activeRun);
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [activeTab, setActiveTab] = useState(restorableWorkout ? "workout" : restorableRunning ? "running" : "home");
  const [selectedDate, setSelectedDate] = useState(restorableWorkout ? initialUi.selectedDate : localDateKey);
  const [workoutMode, setWorkoutMode] = useState(restorableWorkout ? "active" : "overview");
  const [workoutPreparations, setWorkoutPreparations] = useState({});
  const [profileOpen, setProfileOpen] = useState(false);
  const [locationManagerFromWorkout, setLocationManagerFromWorkout] = useState(false);
  const [profileInitialSection, setProfileInitialSection] = useState(null);
  const [routineOpen, setRoutineOpen] = useState(false);
  const [newExerciseId, setNewExerciseId] = useState("");
  const contentRef = useRef(null);
  const [todayDate, setTodayDate] = useState(localDateKey);
  const [runSession, setRunSession] = useState(null);
  const [runError, setRunError] = useState("");
  const [storageError, setStorageError] = useState("");
  const runningTrackerRef = useRef(null);
  const dataRef = useRef(data);
  const pendingCompletedRunsRef = useRef(new Map());
  const processingCompletedRunsRef = useRef(new Set());
  const persistedCompletedRunsRef = useRef(new Set());
  const completedSaveErrorsRef = useRef(new Map());
  const completionWaitersRef = useRef(new Map());
  const lastRunStateKeyRef = useRef(undefined);

  dataRef.current = data;
  useEffect(() => {
    let mounted = true;
    const onState = (result) => {
      if (!mounted) return;
      const nextSession = result?.session || null;
      const stateKey = nextSession ? [nextSession.id, nextSession.status, nextSession.elapsedMs, nextSession.distanceMeters, nextSession.track?.length, nextSession.laps?.length, nextSession.gpsStatus, nextSession.phase, nextSession.intervalIndex].join("|") : "none";
      if (stateKey === lastRunStateKeyRef.current) return;
      lastRunStateKeyRef.current = stateKey;
      setRunSession(nextSession);
      if (nextSession?.status === "completed") {
        if (nextSession.id) pendingCompletedRunsRef.current.set(nextSession.id, nextSession);
        setData((current) => {
          const runningHistory = [...(current.runningHistory || []).filter((item) => item.id !== nextSession.id), nextSession]
            .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
          const next = { ...current, runningHistory };
          delete next.activeRun;
          return next;
        });
      } else {
        setData((current) => {
          const next = { ...current };
          if (nextSession) next.activeRun = nextSession;
          else delete next.activeRun;
          return next;
        });
      }
    };
    const tracker = createRunningTracker({ initialSession: data.activeRun, onState, onError: (error) => { if (mounted) setRunError(error?.message || "러닝 트래커에 연결할 수 없습니다."); } });
    runningTrackerRef.current = tracker;
    Promise.resolve(tracker.getState()).then(onState).catch((error) => { if (mounted) setRunError(error?.message || "러닝 기록을 복구하지 못했습니다."); });
    return () => {
      mounted = false;
      tracker.destroy();
      if (runningTrackerRef.current === tracker) runningTrackerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const refreshDay = () => setTodayDate(localDateKey());
    const timer = window.setInterval(refreshDay, 30000);
    window.addEventListener("focus", refreshDay);
    document.addEventListener("visibilitychange", refreshDay);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshDay); document.removeEventListener("visibilitychange", refreshDay); };
  }, []);

  useEffect(() => {
    setStorageError(saveAppData(data) ? "" : "기기에 기록을 저장하지 못했습니다. 저장 공간을 확인해 주세요. 앱을 닫으면 최근 기록이 사라질 수 있습니다.");
  }, [data]);
  useEffect(() => {
    for (const [id, run] of pendingCompletedRunsRef.current) {
      if (processingCompletedRunsRef.current.has(id)) continue;
      processingCompletedRunsRef.current.add(id);
      const runningHistory = [...(data.runningHistory || []).filter((item) => item.id !== id), run]
        .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
      const next = { ...data, runningHistory };
      delete next.activeRun;
      if (!saveAppData(next)) {
        const error = new Error("러닝을 저장하지 못했습니다. 저장 공간을 확인하고 앱을 다시 열어 주세요.");
        setRunError(error.message);
        completedSaveErrorsRef.current.set(id, error);
        completionWaitersRef.current.get(id)?.reject(error);
        completionWaitersRef.current.delete(id);
        processingCompletedRunsRef.current.delete(id);
        continue;
      }
      dataRef.current = next;
      persistedCompletedRunsRef.current.add(id);
      completedSaveErrorsRef.current.delete(id);
      if (JSON.stringify(next.runningHistory) !== JSON.stringify(data.runningHistory)) setData(next);
      completionWaitersRef.current.get(id)?.resolve({ session: run, persisted: true });
      completionWaitersRef.current.delete(id);
      Promise.resolve(runningTrackerRef.current?.acknowledgeFinished({ id }))
        .then(() => {
          pendingCompletedRunsRef.current.delete(id);
          processingCompletedRunsRef.current.delete(id);
          setRunError("");
        })
        .catch((error) => {
          processingCompletedRunsRef.current.delete(id);
          setRunError(error?.message || "러닝을 저장한 뒤 트래커 상태를 정리하지 못했습니다.");
        });
    }
  }, [data]);
  useEffect(() => {
    try { localStorage.setItem(UI_STATE_KEY, JSON.stringify({ activeTab, selectedDate, workoutMode })); } catch { /* UI state is best effort. */ }
  }, [activeTab, selectedDate, workoutMode]);
  useEffect(() => {
    readApiKey().then((key) => { setApiKey(key); setConfigured(Boolean(key)); }).catch(() => setConfigured(false));
  }, []);
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [activeTab, workoutMode, profileOpen, profileInitialSection]);
  useEffect(() => {
    const handleAndroidBack = () => {
      if (document.querySelector('[role="dialog"]')) return;
      if (routineOpen) { setRoutineOpen(false); return; }
      if (profileOpen) {
        if (profileInitialSection) { setProfileInitialSection(null); return; }
        setProfileOpen(false);
        setLocationManagerFromWorkout(false);
        return;
      }
      if (activeTab === "workout" && workoutMode === "active") { window.dispatchEvent(new Event("healthlog:workout-back")); return; }
      if (activeTab === "workout" && workoutMode !== "overview") { setWorkoutMode("overview"); return; }
      if (activeTab !== "home") setActiveTab("home");
    };
    window.addEventListener("healthlog:back", handleAndroidBack);
    return () => window.removeEventListener("healthlog:back", handleAndroidBack);
  }, [activeTab, workoutMode, profileOpen, profileInitialSection, routineOpen]);

  const hasStarted = hasStartedSession;
  const resolvedSession = useMemo(() => resolveSessionForDate(data, selectedDate), [data, selectedDate]);
  const session = useMemo(() => sessionWithCurrentLocation(resolvedSession, data.locations), [resolvedSession, data.locations]);
  const todaySession = useMemo(() => selectedDate === todayDate ? session : resolveSessionForDate(data, todayDate), [data, todayDate, selectedDate, session]);
  const todayRestRecommended = todaySession?.label === "REST";
  const todayPostponement = (data.postponements || []).find((item) => item.date === todayDate) || null;
  const todayRunRecommendation = runningRecommendation(todaySession?.label, {
    postponed: Boolean(todayPostponement),
    fatigue: Number(todaySession?.context?.readiness?.fatigue ?? 0) >= 4,
  });
  const runRecommendation = todayRunRecommendation ? { ...todayRunRecommendation, pplType: todaySession?.label } : null;
  const availableForSession = session?.context ? availableExercises(session.context, data.plan) : EXERCISES;
  const updateSession = (next) => setData((current) => ({ ...current, drafts: { ...current.drafts, [selectedDate]: withSessionTimeBudget(normalizeWorkoutSession(sessionWithCurrentLocation(next, current.locations))) } }));

  const saveLocation = ({ id, name, equipment, equipmentItems = [] }) => {
    const normalized = normalizeLocationEquipment({ equipment, equipmentItems });
    const saved = { ...normalized, equipmentItems: normalized.equipmentItems.map((item) => {
      const configuredItem = equipmentItems.find((savedItem) => savedItem.id === item.id);
      return { ...item, ...(configuredItem ? { loadSteps: configuredItem.loadSteps || [], availableLoads: configuredItem.availableLoads || [], loadBasis: configuredItem.loadBasis || "total" } : {}) };
    }), id: id || `place-${crypto.randomUUID()}`, name: name.trim(), ready: true };
    setData((current) => ({
      ...current,
      locations: id ? current.locations.map((item) => item.id === id ? saved : item) : [...current.locations, saved],
      drafts: Object.fromEntries(Object.entries(current.drafts).map(([date, draft]) => [date, sessionWithCurrentLocation(draft, [saved])])),
    }));
    if (locationManagerFromWorkout) {
      setWorkoutPreparations((current) => ({
        ...current,
        [selectedDate]: { ...(current[selectedDate] || {}), locationId: saved.id },
      }));
    }
  };

  const parseLocation = async (description) => {
    return parseLocationWithAI(apiKey, description);
  };

  const prepareSession = ({ type, durationMinutes, locationId, readiness = {} }) => {
    const location = data.locations.find((item) => item.id === locationId);
    if (!location?.ready || !durationMinutes) return;
    const context = { durationMinutes: Number(durationMinutes), locationId, locationName: location.name, equipment: [...new Set(["맨몸", ...location.equipment])], equipmentItems: location.equipmentItems || normalizeLocationEquipment(location).equipmentItems, readiness };
    const draft = makeSession(data.plan, data.history, selectedDate, type, context);
    draft.manualType = type !== makeSession(data.plan, data.history, selectedDate).label;
    setData((current) => ({
      ...current,
      drafts: { ...current.drafts, [selectedDate]: draft },
    }));
  };

  const generateProposal = async (payload) => {
    const result = await generatePlan(apiKey, { ...payload, history: data.history });
    return { ...result, plan: normalizePlan(result.plan, payload.intake, { trustRawRules: true }) };
  };

  const saveApiKey = async (key) => {
    await writeApiKey(key.trim());
    setApiKey(key.trim());
    setConfigured(Boolean(key.trim()));
  };
  const interpretCheckin = (text) => interpretCheckinWithAI(apiKey, text);
  const estimateMeal = (payload) => estimateMealWithAI(apiKey, payload);
  const analyzeMealPhoto = (payload) => analyzeMealPhotoWithAI(apiKey, payload);

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
    setProfileOpen(false);
    setActiveTab("home");
  };

  const saveIntakePreferences = (input, reviewedRules = null) => {
    const intake = normalizeIntake({ ...input, preferMachinesWhenEquivalent: reviewedRules?.preferMachinesWhenEquivalent ?? input.preferMachinesWhenEquivalent });
    setData((current) => {
      const trainingRules = reviewedRules ? normalizeTrainingRules(reviewedRules, intake, EXERCISES) : undefined;
      const plan = { ...normalizePlan({ ...current.plan, trainingRules, preferredExerciseIds: [], excludedExerciseIds: [] }, intake), goalSummary: intake.goal, version: (current.plan?.version || 1) + 1, changeSummary: "목표와 추천 우선순위 수정" };
      const sessions = new Set(SPLITS[plan.split]?.sessions || []);
      const drafts = Object.fromEntries(Object.entries(current.drafts).map(([date, draft]) => {
        const started = hasStarted(draft);
        if (started) return [date, draft];
        const forcedType = draft.manualType && sessions.has(draft.label) ? draft.label : null;
        return [date, { ...makeSession(plan, current.history, date, forcedType, draft.context), manualType: Boolean(forcedType) }];
      }));
      return { ...current, intake, plan, drafts, revisions: [...current.revisions, { at: new Date().toISOString(), scope: "goal", summary: "목표와 추천 우선순위 수정" }] };
    });
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
    const ruleInput = proposal.plan.trainingRules ? { ...proposal.plan, trainingRules: normalizeTrainingRules(proposal.plan.trainingRules, nextIntake, EXERCISES) } : proposal.plan;
    const plan = { ...normalizePlan(ruleInput, nextIntake), version: (data.plan?.version || 1) + 1 };
    const started = hasStarted(session);
    const keepToday = started || session?.status === "complete";
    const draft = keepToday ? session : applyExerciseIds(makeSession(plan, data.history, selectedDate, null, session?.context), proposal.exerciseIds || [], plan);
    setData((current) => ({
      ...current,
      intake: nextIntake,
      plan,
      drafts: {
        ...Object.fromEntries(Object.entries(current.drafts).map(([date, existing]) => [date, hasStarted(existing) ? existing : { ...makeSession(plan, current.history, date, existing.manualType ? existing.label : null, existing.context), manualType: existing.manualType }])),
        ...(!keepToday ? { [selectedDate]: draft } : {}),
      },
      revisions: [...current.revisions, note],
    }));
  };

  const finishSession = (finished, status = "complete") => {
    const saved = normalizeWorkoutSession({ ...finished, status, completedAt: new Date().toISOString() });
    setData((current) => {
      const drafts = { ...current.drafts };
      delete drafts[saved.date];
      return { ...current, drafts, history: [...current.history.filter((item) => item.date !== saved.date), saved] };
    });
    setWorkoutMode("overview");
    setActiveTab("home");
  };

  const deleteWorkout = (date) => {
    setData((current) => {
      const drafts = { ...current.drafts };
      delete drafts[date];
      return { ...current, drafts, history: current.history.filter((item) => item.date !== date) };
    });
    setWorkoutPreparations((current) => {
      const next = { ...current };
      delete next[date];
      return next;
    });
    setWorkoutMode("overview");
  };

  const saveMeal = (meal, remember) => setData((current) => ({
    ...current,
    meals: [...current.meals, { ...meal, id: meal.id || `meal-${crypto.randomUUID()}`, date: meal.date || selectedDate }],
    favoriteProducts: remember && meal.product ? [...current.favoriteProducts.filter((item) => item.name !== meal.product.name), meal.product] : current.favoriteProducts,
  }));

  const updateMeal = (identity, patch) => setData((current) => ({
    ...current,
    meals: current.meals.map((meal) => (meal.id || meal.at) === identity ? { ...meal, ...patch } : meal),
  }));

  const deleteMeal = (identity) => setData((current) => ({
    ...current,
    meals: current.meals.filter((meal) => (meal.id || meal.at) !== identity),
  }));

  const saveWeight = (record) => setData((current) => ({
    ...current,
    weights: [...(current.weights || []).filter((item) => item.date !== record.date), { ...record, id: record.id || `weight-${record.date}` }]
      .sort((a, b) => String(a.date).localeCompare(String(b.date))),
  }));

  const deleteWeight = (date) => setData((current) => ({
    ...current,
    weights: (current.weights || []).filter((item) => item.date !== date),
  }));

  const saveNutritionSettings = (nutritionSettings) => setData((current) => ({ ...current, nutritionSettings }));

  const postponeTodayWorkout = () => {
    setData((current) => postponeWorkout(current, todayDate));
    setWorkoutMode("overview");
    setActiveTab("home");
  };

  const undoTodayPostponement = () => setData((current) => undoWorkoutPostponement(current, todayDate));

  const startWorkout = () => {
    setSelectedDate(localDateKey());
    setActiveTab("workout");
    setWorkoutMode("prepare");
  };

  const runCommand = async (method, ...args) => {
    const result = await runningTrackerRef.current[method](...args);
    setRunError("");
    return result;
  };

  const finishRunning = async (input) => {
    const result = await runCommand("finish", input);
    const completed = result?.session;
    if (completed?.status !== "completed" || !completed.id) return result;
    if (completedSaveErrorsRef.current.has(completed.id)) throw completedSaveErrorsRef.current.get(completed.id);
    if (persistedCompletedRunsRef.current.has(completed.id)) {
      return { ...result, persisted: true };
    }
    return new Promise((resolve, reject) => {
      completionWaitersRef.current.set(completed.id, { resolve, reject });
    });
  };

  const renderScreen = () => {
    if (profileOpen) return <ProfileScreen intake={data.intake} plan={data.plan} session={session} weights={data.weights || []} locations={data.locations} onSaveLocation={saveLocation} onParseLocation={parseLocation} configured={configured} apiKey={apiKey} onSaveApiKey={saveApiKey} section={profileInitialSection} onSectionChange={setProfileInitialSection} onGenerate={generateProposal} onInterpretRules={(intake) => interpretTrainingRules(apiKey, intake)} onApplyRevision={applyRevision} onSaveIntake={saveIntakePreferences} onBack={() => { setProfileOpen(false); setProfileInitialSection(null); setLocationManagerFromWorkout(false); }} />;
    if (activeTab === "home") return <HomeScreen selectedDate={selectedDate} setSelectedDate={setSelectedDate} session={session} todaySession={todaySession} todayRestRecommended={todayRestRecommended} postponements={data.postponements || []} history={data.history} drafts={data.drafts} meals={data.meals} todayDate={todayDate} plan={data.plan} onDeleteWorkout={deleteWorkout} onStartWorkout={startWorkout} onPostponeWorkout={postponeTodayWorkout} onUndoPostponement={undoTodayPostponement} onOpenMeals={() => { setSelectedDate(todayDate); setActiveTab("meal"); }} onOpenRoutine={() => { setSelectedDate(todayDate); if (todaySession?.exercises.length) setRoutineOpen(true); else startWorkout(); }} onOpenRunning={() => setActiveTab("running")} runningSuggestion={runRecommendation} />;
    if (activeTab === "workout") return <WorkoutScreen mode={workoutMode} setMode={setWorkoutMode} session={session} plan={data.plan} history={data.history} locations={data.locations} exerciseOptions={availableForSession} preparation={workoutPreparations[selectedDate]} onPreparationChange={(next) => setWorkoutPreparations((current) => ({ ...current, [selectedDate]: next }))} postponement={todayPostponement} onUndoPostponement={undoTodayPostponement} aiConfigured={configured} onInterpretCheckin={interpretCheckin} onPrepareSession={prepareSession} onManageLocations={() => { setLocationManagerFromWorkout(true); setProfileInitialSection("gym"); setProfileOpen(true); }} onChange={updateSession} onReplaceExercise={(index, id) => updateSession(replaceExercise(session, index, id))} onResetSession={() => deleteWorkout(selectedDate)} onFinish={finishSession} onEditSession={() => setRoutineOpen(true)} onOpenProgram={() => { setProfileInitialSection("training"); setProfileOpen(true); }} onBackHome={() => setActiveTab("home")} />;
    if (activeTab === "running") return <RunningScreen session={runSession} history={data.runningHistory || []} recommendation={runRecommendation} adapterError={runError} onStart={(input) => runCommand("start", input)} onPause={() => runCommand("pause")} onResume={() => runCommand("resume")} onLap={() => runCommand("lap")} onFinish={finishRunning} onDelete={(id) => setData((current) => ({ ...current, runningHistory: (current.runningHistory || []).filter((run) => run.id !== id) }))} />;
    if (activeTab === "meal") return <MealScreen date={todayDate} meals={data.meals} weights={data.weights || []} nutritionSettings={data.nutritionSettings} goal={data.intake?.goal} onSaveNutritionSettings={saveNutritionSettings} favoriteProducts={data.favoriteProducts} configured={configured} onEstimateMeal={estimateMeal} onAnalyzeMealPhoto={analyzeMealPhoto} onSaveMeal={saveMeal} onUpdateMeal={updateMeal} onDeleteMeal={deleteMeal} onSaveWeight={saveWeight} onDeleteWeight={deleteWeight} />;
    return null;
  };

  const sessionActive = activeTab === "workout" && workoutMode === "active";
  const chromeHidden = profileOpen || sessionActive;
  const onboarding = !data.plan;

  return (
    <main className="app-shell">
      <div className="phone-frame">
        {onboarding ? (
          <div className="app-content onboarding-content"><Suspense fallback={<p role="status">설정을 불러오는 중…</p>}><OnboardingScreen initialIntake={null} configured={configured} apiKey={apiKey} onSaveApiKey={saveApiKey} onGenerate={generateProposal} onComplete={saveInitialPlan} /></Suspense></div>
        ) : (
          <>
            {!profileOpen && !sessionActive && <header className="app-header">
              <button className="brand" onClick={() => setActiveTab("home")} aria-label="홈으로 이동"><img className="brand-mark" src="/healthlog-logo-v1.png" alt="" /><span>HealthLog</span></button>
              <button className="profile-button" onClick={() => { setSelectedDate(todayDate); setProfileInitialSection(null); setProfileOpen(true); }} aria-label="프로필 열기"><UserRound size={19} /></button>
            </header>}
            {storageError && <p className="storage-error" role="alert">{storageError}</p>}
            <div ref={contentRef} className={`app-content${sessionActive ? " session-content" : ""}${chromeHidden ? " chrome-hidden" : ""}`}><Suspense fallback={<p className="connection-note" role="status">화면을 불러오는 중…</p>}>{renderScreen()}</Suspense></div>
            <BottomNav active={activeTab} onChange={(tab) => { setProfileOpen(false); if (tab === "workout" || tab === "meal") setSelectedDate(localDateKey()); setActiveTab(tab); }} hidden={chromeHidden} />
            {routineOpen && session?.exercises.length > 0 && <Modal title="운동 순서·종목 편집" onClose={() => setRoutineOpen(false)}>
              <p className="sheet-description">오늘 운동의 순서를 바꾸거나 종목을 교체합니다. 이미 기록한 종목은 그대로 유지됩니다.</p>
              <div className="routine-edit-list">
                {session.exercises.map((exercise, index) => <div className="routine-edit-item" key={`${exercise.id}-${index}`}>
                  <div className="routine-edit-main"><span className="exercise-index">{index + 1}</span><label><small>{exercise.target}{exercise.pattern ? ` · ${BACK_PATTERN_LABELS[exercise.pattern] || exercise.pattern}` : ""}</small><select aria-label={`${index + 1}번 운동 교체`} disabled={Boolean(exercise.completedSets?.length && !exercise.completedSets.some((set) => set.pain || set.formFailure))} value={exercise.id} onChange={(event) => updateSession(replaceExercise(session, index, event.target.value))}>{[exercise, ...replacementOptions(exercise, availableForSession, session.exercises)].map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label></div>
                  <div className="routine-edit-actions"><button aria-label={`${index + 1}번 운동 위로`} disabled={index === 0 || Boolean(exercise.completedSets?.length)} onClick={() => { const exercises = [...session.exercises]; [exercises[index - 1], exercises[index]] = [exercises[index], exercises[index - 1]]; updateSession({ ...session, exercises }); }}>위로</button><button aria-label={`${index + 1}번 운동 아래로`} disabled={index === session.exercises.length - 1 || Boolean(exercise.completedSets?.length)} onClick={() => { const exercises = [...session.exercises]; [exercises[index + 1], exercises[index]] = [exercises[index], exercises[index + 1]]; updateSession({ ...session, exercises }); }}>아래로</button><button className="danger-text" aria-label={`${exercise.name} 제외`} disabled={Boolean(exercise.completedSets?.length)} onClick={() => updateSession({ ...session, exercises: session.exercises.filter((_, at) => at !== index) })}>제외</button></div>
                </div>)}
              </div>
              <div className="add-exercise-row"><select aria-label="추가할 운동" value={newExerciseId} onChange={(event) => setNewExerciseId(event.target.value)}><option value="">추가할 운동 선택</option>{availableForSession.filter((option) => !session.exercises.some((item) => item.id === option.id)).map((option) => <option key={option.id} value={option.id}>{option.target} · {option.name}</option>)}</select><button className="secondary-button" disabled={!newExerciseId} onClick={() => { const item = EXERCISES.find((option) => option.id === newExerciseId); if (item) updateSession({ ...session, exercises: [...session.exercises, createPlannedExercise(item, session.context)] }); setNewExerciseId(""); }}>추가</button></div>
              <button className="primary-button" onClick={() => setRoutineOpen(false)}>편집 완료</button>
            </Modal>}
          </>
        )}
      </div>
    </main>
  );
}
