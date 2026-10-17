import { ChevronDown, ChevronLeft, ChevronUp, Clock3, MoreHorizontal, RotateCcw, TimerReset } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import {
  cardioRecommendation,
  BACK_PATTERN_LABELS,
  classifyWorkoutInput,
  availableNextLoad,
  availablePreviousLoad,
  adaptRemainingVolume,
  evaluateSet,
  equipmentKeyForExercise,
  equipmentForExercise,
  loadBasisForExercise as getProgramLoadBasis,
  exerciseWarmupTarget,
  completedWarmupCount,
  completeExerciseWarmup,
  generalWarmupForType,
  nextSessionLoad,
  pauseSessionTimer,
  recommendedSetInput,
  replacementOptions,
  resumeSessionTimer,
  setFeedbackFromText,
  sessionElapsedSeconds,
  shouldEndExercise,
  SPLITS,
  restRecommended,
  workoutType,
  warmupDecision,
  workoutFlowGroups,
  workoutProgress,
} from "../lib/program";
import { startExerciseTimerNotification, startRestTimerNotification, stopExerciseTimerNotification, stopRestTimerNotification } from "../lib/nativeTimers";
import { hasStartedSession } from "../lib/workoutHistory";
import { TRAINING_PATTERNS } from "../lib/trainingRules";
import { formatRestTargetDetails, getRestPreview, nextIncompleteExerciseIndex as nextIncompleteIndex } from "../lib/restPreview";

const timeLabel = (total = 0) => {
  const safe = Math.max(0, Math.floor(total));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
};

const setLabel = (set = {}, measurement = "reps_weight", exercise = {}) => {
  if (measurement === "unilateral_hold_seconds") return /^(왼쪽|오른쪽)/.test(set.note || "") ? set.note : `${set.durationSeconds || 0}초/편측`;
  if (["hold_seconds", "timed_activity"].includes(measurement)) return `${set.durationSeconds || 0}초`;
  if (measurement === "distance_time") return `${set.distance || 0}m · ${set.durationSeconds || 0}초`;
  const unit = set.loadBasis === "assistance" ? "kg(보조)" : set.loadBasis === "per_hand" ? "kg/손" : set.loadBasis === "per_side" ? "kg/편측" : set.loadBasis === "total_on_bar" ? "kg(총중량)" : loadUnitForExercise(exercise);
  return `${set.weight || (set.weight === 0 && unit === "kg(보조)") ? `${set.weight}${unit} · ` : ""}${set.reps || 0}회`;
};

function restGoalLabel({ exercise, phase, warmups, warmupTarget, workSets }) {
  if (phase === "warmup") return `워밍업 ${warmups + 1}/${warmupTarget}`;
  return `본세트 ${workSets + 1}/${exercise.sets}`;
}

export default function WorkoutScreen({ mode, setMode, session, plan, history = [], locations, exerciseOptions = [], preparation, onPreparationChange, postponement, onUndoPostponement, aiConfigured, onInterpretCheckin, onPrepareSession, onManageLocations, onChange, onReplaceExercise, onResetSession, onFinish, onEditSession, onOpenProgram, onBackHome }) {
  const [exerciseIndex, setExerciseIndex] = useState(() => Math.max(0, Number(session?.activeExerciseIndex) || 0));
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(8);
  const [rir, setRir] = useState(2);
  const [duration, setDuration] = useState(30);
  const [distance, setDistance] = useState(0);
  const [setStatus, setSetStatus] = useState("normal");
  const [setNote, setSetNote] = useState("");
  const [quickInput, setQuickInput] = useState("");
  const [inputMessage, setInputMessage] = useState("");
  const [sheet, setSheet] = useState(() => session?.restTimer ? "rest" : null);
  const [restSeconds, setRestSeconds] = useState(() => session?.restTimer?.running
    ? Math.max(0, Math.ceil((Number(session.restTimer.endsAt) - Date.now()) / 1000))
    : Math.max(0, Number(session?.restTimer?.remainingSeconds) || 120));
  const [timerRunning, setTimerRunning] = useState(() => Boolean(session?.restTimer?.running));
  const [recommendation, setRecommendation] = useState(null);
  const [selectedAction, setSelectedAction] = useState("maintain");
  const [checkinResult, setCheckinResult] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [editingPreviousSet, setEditingPreviousSet] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [inputRecommendation, setInputRecommendation] = useState(null);
  const [timedSide, setTimedSide] = useState("왼쪽");

  const readyLocations = locations.filter((item) => item.ready);
  const nextWorkoutType = session?.label === "REST" ? SPLITS[plan.split].sessions[0] : workoutType(plan, 0, history, session?.date);
  const todayRestRecommended = session?.label === "REST" || restRecommended(plan, history, session?.date);
  const preparationDefaults = {
    sessionType: session?.label && session.label !== "REST" ? session.label : nextWorkoutType,
    durationMinutes: session?.context?.durationMinutes || "60",
    locationId: session?.context?.locationId || (readyLocations.length === 1 ? readyLocations[0].id : ""),
    sleepHours: session?.context?.readiness?.sleepHours || "7",
    fatigue: session?.context?.readiness?.fatigue ?? 1,
    painNote: session?.context?.readiness?.painNote || "",
    redFlag: Boolean(session?.context?.readiness?.redFlag),
    checkinText: session?.context?.readiness?.checkinText || "",
  };
  const currentPreparation = { ...preparationDefaults, ...preparation, durationMinutes: preparation?.durationMinutes || preparationDefaults.durationMinutes };
  const { sessionType, durationMinutes, locationId, sleepHours, fatigue, painNote, redFlag, checkinText } = currentPreparation;
  const updatePreparation = (patch) => onPreparationChange({ ...currentPreparation, ...patch });
  const selectedLocation = readyLocations.find((item) => item.id === locationId);
  const selectedEquipment = ["맨몸", ...(selectedLocation?.equipment || [])];
  const exercise = session?.exercises[Math.min(exerciseIndex, Math.max((session?.exercises.length || 1) - 1, 0))];
  const completedSets = session?.exercises.reduce((sum, item) => sum + (item.completedSets?.length || 0), 0) || 0;
  const totalSets = session?.exercises.reduce((sum, item) => sum + (item.sets || 0), 0) || 0;
  const progress = workoutProgress(session);
  const progressPercent = progress.total ? Math.round((progress.completed / progress.total) * 100) : 0;
  const elapsedSeconds = sessionElapsedSeconds(session, nowMs);
  const plannedSeconds = Number(session?.context?.durationMinutes || 0) * 60;
  const remainingSeconds = plannedSeconds - elapsedSeconds;
  const remainingMinutes = Math.max(0, Math.ceil(remainingSeconds / 60));
  const warmupTarget = exerciseWarmupTarget(exercise, session?.exercises.slice(0, exerciseIndex));
  const warmupCompleted = completedWarmupCount(exercise, session?.exercises.slice(0, exerciseIndex));
  const phase = !session?.generalWarmup?.completed ? "body" : warmupCompleted < warmupTarget ? "warmup" : "work";
  const groups = useMemo(() => workoutFlowGroups(session), [session]);
  const generalWarmup = session?.generalWarmup?.exercises?.length >= 4 ? session.generalWarmup : { ...session?.generalWarmup, ...generalWarmupForType(session?.label) };
  const alternatives = replacementOptions(exercise, exerciseOptions, session?.exercises || []);

  useEffect(() => {
    const suggested = recommendedSetInput(exercise, history, { phase, warmupIndex: warmupCompleted, context: session?.context, currentSession: session, locationId: session?.context?.locationId });
    const currentRecord = exercise?.completedSets?.at(-1);
    const nextWeight = phase === "work" && exercise?.nextRecommendedWeight != null ? exercise.nextRecommendedWeight : suggested.weight;
    const assisted = loadBasisForExercise(exercise, session?.context) === "assistance";
    const defaultReason = suggested.needsInitialLoad ? assisted ? "첫 수행이므로 기구에 표시된 보조 중량을 직접 입력하세요." : "이 종목의 중량 기록이 없습니다. 가벼운 준비 세트에서 확인한 실제 중량을 입력하세요." : suggested.source === "equipment_starting_point" ? "등록한 기구의 보조 중량 목록에서 정한 시작 제안입니다. 실제 수행에 맞게 조절하세요." : suggested.loadAdjustment === "increase_load" ? assisted ? "보조 중량을 한 단계 줄여 난이도를 높인 값" : "최근 반복과 여유를 반영해 한 단계 높인 값" : suggested.loadAdjustment === "reduce_load" ? assisted ? "보조 중량을 한 단계 늘려 난이도를 낮춘 값" : "최근 반복과 여유를 반영해 한 단계 낮춘 값" : phase === "warmup" ? "가볍게 준비하는 워밍업 권장값" : ["history", "session", "history_progression", "session_adjustment"].includes(suggested.source) ? "같은 종목의 최근 실제 기록을 바탕으로 제안" : "목표 반복 범위에 맞춘 시작값";
    setInputRecommendation({ ...suggested, needsInitialLoad: exercise?.nextRecommendedWeight != null ? false : suggested.needsInitialLoad, weight: nextWeight, reason: exercise?.nextRecommendedReason || suggested.reason || defaultReason });
    setWeight(suggested.needsInitialLoad && exercise?.nextRecommendedWeight == null && currentRecord?.weight == null ? "" : nextWeight);
    setReps(suggested.reps);
    setDuration(session?.timedExerciseTimer?.exerciseId === exercise?.id && session?.timedExerciseTimer?.finishedAt
      ? Number(session.timedExerciseTimer.actualDurationSeconds) || 0
      : suggested.durationSeconds ?? 30);
    if (session?.timedExerciseTimer?.exerciseId === exercise?.id && session?.timedExerciseTimer?.side) setTimedSide(session.timedExerciseTimer.side);
    setDistance(exercise?.completedSets?.at(-1)?.distance ?? 0);
    setRir(exercise?.completedSets?.at(-1)?.rir ?? 2);
    setQuickInput("");
    setInputMessage("");
    setEditingPreviousSet(false);
  }, [exercise?.id, phase, warmupCompleted, exercise?.completedSets, exercise?.nextRecommendedWeight, session?.context?.locationId, session?.timedExerciseTimer?.finishedAt, session?.timedExerciseTimer?.actualDurationSeconds, history]);

  useEffect(() => {
    if (mode !== "active" || !session?.activeStartedAt) return undefined;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [mode, session?.activeStartedAt]);

  useEffect(() => {
    const onWorkoutBack = () => pauseWorkout(false);
    window.addEventListener("healthlog:workout-back", onWorkoutBack);
    return () => window.removeEventListener("healthlog:workout-back", onWorkoutBack);
  });

  useEffect(() => {
    if (!timerRunning || !session?.restTimer?.endsAt) return undefined;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((Number(session.restTimer.endsAt) - Date.now()) / 1000));
      setRestSeconds(remaining);
      if (remaining <= 0) setTimerRunning(false);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [timerRunning, session?.restTimer?.endsAt]);

  const timedTimer = session?.timedExerciseTimer;
  const activeTimedTimer = timedTimer?.exerciseId === exercise?.id ? timedTimer : null;
  const timedElapsed = activeTimedTimer?.running
    ? Math.max(0, Number(activeTimedTimer.elapsedSeconds) || 0) + Math.max(0, Math.floor((nowMs - Number(activeTimedTimer.startedAt || nowMs)) / 1000))
    : Math.max(0, Number(activeTimedTimer?.elapsedSeconds) || 0);
  useEffect(() => {
    if (!activeTimedTimer?.running || timedElapsed < Number(activeTimedTimer.targetSeconds || 0) || activeTimedTimer.targetNotified) return;
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([180, 100, 180]);
    onChange({ ...session, timedExerciseTimer: { ...activeTimedTimer, targetNotified: true } });
  }, [activeTimedTimer?.running, activeTimedTimer?.targetSeconds, activeTimedTimer?.startedAt, activeTimedTimer?.elapsedSeconds, activeTimedTimer?.targetNotified, timedElapsed]);

  if (postponement && mode !== "active") return <div className="screen"><section className="card workout-overview-card postponed-overview"><span className="eyebrow">POSTPONED</span><h1>오늘 운동은 내일 이어집니다</h1><p>{postponement.label} 순서를 바꾸지 않고 {Number(postponement.targetDate.slice(5, 7))}월 {Number(postponement.targetDate.slice(8, 10))}일로 옮겼습니다.</p><button className="secondary-button" onClick={onUndoPostponement}>미루기 되돌리기</button><button className="text-button" onClick={onBackHome}>홈으로</button></section></div>;
  if (!session) return <div className="screen"><p>운동 계획을 먼저 설정해주세요.</p></div>;

  const prepared = session.exercises.length > 0;
  const locked = hasStartedSession(session);
  const planMatches = Number(session.planVersion || 1) === Number(plan.version || 1);
  const contextMatches = Boolean(session.context && selectedLocation && (
    Number(durationMinutes) === session.context.durationMinutes
    && locationId === session.context.locationId
    && [...new Set(selectedEquipment)].sort().join("|") === [...session.context.equipment].sort().join("|")
    && sessionType === session.label
  ));
  const settingsMatch = (locked && prepared) || Boolean(session.context && selectedLocation && (
    contextMatches && planMatches
  ));
  const prepareHint = !durationMinutes
    ? "운동할 시간을 선택해주세요."
    : !selectedLocation
      ? "저장한 운동 장소를 선택해주세요."
      : redFlag
        ? "전신 이상 증상을 해제하거나 상태를 먼저 확인해주세요."
        : prepared && contextMatches && !planMatches
          ? "프로필 변경사항을 반영하려면 운동 흐름을 다시 만들어주세요."
          : prepared && settingsMatch
          ? "현재 시간과 장소에 맞는 운동 구성이 준비됐습니다."
          : "";

  function pauseWorkout(returnHome = false) {
    const now = Date.now();
    stopExerciseTimerNotification();
    const paused = pauseTimedActivity(pauseSessionTimer(session, now), now);
    onChange(paused);
    setNowMs(now);
    setMode("overview");
    if (returnHome) onBackHome();
  }

  function pauseTimedActivity(source, now = Date.now()) {
    const timer = source?.timedExerciseTimer;
    if (!timer?.running) return source;
    const elapsed = Math.max(0, Number(timer.elapsedSeconds) || 0) + Math.max(0, Math.floor((now - Number(timer.startedAt || now)) / 1000));
    return { ...source, timedExerciseTimer: { ...timer, running: false, elapsedSeconds: elapsed, startedAt: null, pausedAt: now } };
  }

  function resumeTimedActivity(source, now = Date.now()) {
    const timer = source?.timedExerciseTimer;
    if (!timer || timer.running || timer.finishedAt) return source;
    return { ...source, timedExerciseTimer: { ...timer, running: true, startedAt: now, pausedAt: null } };
  }

  const beginRest = (source, seconds = 120, kind = source?.restTimer?.kind || "work") => {
    const safeSeconds = Math.max(1, Math.ceil(Number(seconds) || (kind === "warmup" ? 60 : 120)));
    const restTimer = { running: true, remainingSeconds: safeSeconds, endsAt: Date.now() + safeSeconds * 1000, kind, exerciseId: source?.restTimer?.exerciseId || exercise?.id };
    onChange({ ...source, restTimer });
    setRestSeconds(safeSeconds);
    setTimerRunning(true);
    startRestTimerNotification(safeSeconds);
  };

  const pauseRest = () => {
    const remaining = Math.max(0, restSeconds);
    setTimerRunning(false);
    stopRestTimerNotification();
    onChange({ ...session, restTimer: { ...session.restTimer, running: false, remainingSeconds: remaining, endsAt: null } });
  };

  const resumeRest = () => beginRest(session, restSeconds || (session?.restTimer?.kind === "warmup" ? 60 : 120));

  const extendRest = () => {
    const remaining = Math.max(0, restSeconds) + 30;
    beginRest(session, remaining);
  };

  const startTimedActivity = () => {
    const now = Date.now();
    const current = activeTimedTimer;
    const nextTimer = current && !current.finishedAt
      ? { ...current, exerciseId: exercise?.id, running: true, startedAt: now, pausedAt: null }
      : { exerciseId: exercise?.id, running: true, targetSeconds: Math.max(1, Number(duration) || 30), elapsedSeconds: 0, startedAt: now, targetNotified: false, side: timedSide };
    onChange({ ...session, timedExerciseTimer: nextTimer });
    startExerciseTimerNotification(Math.max(1, Number(nextTimer.targetSeconds) - Number(nextTimer.elapsedSeconds || 0)), exercise?.name);
  };

  const pauseTimedControl = () => { stopExerciseTimerNotification(); onChange(pauseTimedActivity(session)); };
  const finishTimedActivity = () => {
    const elapsed = activeTimedTimer?.running ? timedElapsed : Number(activeTimedTimer?.elapsedSeconds) || 0;
    const actual = Math.max(1, Math.round(elapsed));
    setDuration(actual);
    stopExerciseTimerNotification();
    onChange({ ...session, timedExerciseTimer: { ...(activeTimedTimer || {}), running: false, elapsedSeconds: actual, actualDurationSeconds: actual, startedAt: null, finishedAt: Date.now(), exerciseId: exercise?.id, side: timedSide } });
    if (phase === "work" && exercise?.measurement === "unilateral_hold_seconds") setSetNote(`${timedSide} ${actual}초`);
  };

  const clearTimedActivity = (source = session) => ({ ...source, timedExerciseTimer: null });

  const suggestLoadChange = (action, currentLoad = weight) => {
    const item = equipmentForExercise(exercise, session.context) || (selectedLocation?.equipmentItems || []).find((equipmentItem) => (equipmentItem.exerciseIds || []).includes(exercise?.id));
    const catalog = session.context?.availableLoads || item?.availableLoads || item?.loads || [];
    const equipment = exercise?.equipment || "";
    const steps = session.context?.loadSteps || item?.loadSteps || exercise?.loadSteps || [];
    const options = { availableLoads: catalog, loadSteps: steps, equipment, exerciseId: exercise?.id, loadBasis: loadBasisForExercise(exercise, session.context) };
    return action === "increase_load" ? availableNextLoad(currentLoad, options) : availablePreviousLoad(currentLoad, options);
  };

  const applyNextAction = () => {
    if (selectedAction === "end_session") { setSheet(null); stopRestTimerNotification(); finishWorkout("complete", { endedEarly: true, completionReason: "상태 판단에 따른 조기 종료" }); return; }
    if (selectedAction === "replace_exercise") { setSheet("replace"); return; }
    if (selectedAction === "end_exercise") { const next = { ...session, exercises: session.exercises.map((item, index) => index === exerciseIndex ? { ...item, skipped: true } : item) }; onChange(next); goNext(next); return; }
    const baseLoad = Number(exercise.completedSets?.at(-1)?.weight ?? weight);
    const changesLoad = selectedAction === "increase_load" || selectedAction === "reduce_load";
    const nextLoad = changesLoad ? suggestLoadChange(selectedAction, baseLoad) : null;
    if (nextLoad != null) {
      setWeight(nextLoad);
      const assisted = loadBasisForExercise(exercise, session.context) === "assistance";
      const reason = assisted ? selectedAction === "increase_load" ? "보조 중량을 줄여 다음 세트 난이도를 높였습니다." : "보조 중량을 늘려 다음 세트 난이도를 낮췄습니다." : selectedAction === "increase_load" ? "다음 세트 권장 중량을 한 단계 올렸습니다." : "다음 세트 권장 중량을 한 단계 낮췄습니다.";
      setInputRecommendation((current) => ({ ...current, weight: nextLoad, reason, source: "action", needsInitialLoad: false }));
      const updated = { ...session, exercises: session.exercises.map((item, index) => index === exerciseIndex ? { ...item, nextRecommendedWeight: nextLoad, nextRecommendedReason: reason } : item) };
      goNext(updated);
      return;
    }
    if (changesLoad && nextLoad == null) {
      const reason = "이 장소에 다음 중량 단계가 없어 실제 직전 중량을 유지합니다.";
      setWeight(baseLoad);
      setInputRecommendation((current) => ({ ...current, weight: baseLoad, reason, source: "action", needsInitialLoad: false }));
      goNext({ ...session, exercises: session.exercises.map((item, index) => index === exerciseIndex ? { ...item, nextRecommendedWeight: baseLoad, nextRecommendedReason: reason } : item) });
      return;
    }
    if (selectedAction === "maintain" && exercise.completedSets?.at(-1)?.weight != null) {
      setWeight(baseLoad);
      setInputRecommendation((current) => ({ ...current, weight: baseLoad, reason: "다음 세트는 실제 직전 중량을 유지합니다.", source: "action", needsInitialLoad: false }));
      goNext({ ...session, exercises: session.exercises.map((item, index) => index === exerciseIndex ? { ...item, nextRecommendedWeight: baseLoad, nextRecommendedReason: "다음 세트는 실제 직전 중량을 유지합니다." } : item) });
      return;
    }
    goNext();
  };

  const confirmExerciseStart = () => {
    const adapted = adaptRemainingVolume(session, history, session.date);
    const next = { ...adapted, activeExerciseIndex: exerciseIndex, exercises: adapted.exercises.map((item, index) => index === exerciseIndex ? { ...item, startConfirmed: true } : item) };
    onChange(next);
  };

  const selectExercise = (index) => {
    if (index !== exerciseIndex) stopExerciseTimerNotification();
    setExerciseIndex(index);
    onChange(index === exerciseIndex
      ? { ...session, activeExerciseIndex: index }
      : clearTimedActivity({ ...session, activeExerciseIndex: index }));
  };

  const openNextAction = () => {
    setTimerRunning(false);
    stopRestTimerNotification();
    onChange({ ...session, restTimer: null });
    setSheet("next_action");
  };

  function finishWarmupRest() {
    setTimerRunning(false);
    stopRestTimerNotification();
    onChange({ ...session, restTimer: null });
    setSheet(null);
  }

  const finishRest = () => session?.restTimer?.kind === "warmup" ? finishWarmupRest() : openNextAction();

  const finishWorkout = (status, details = {}) => { stopExerciseTimerNotification(); return onFinish({ ...clearTimedActivity(pauseSessionTimer(session, Date.now())), ...details, restTimer: null }, status); };

  const resetControl = prepared && <div className="workout-reset-control">{resetConfirm ? <><p>오늘 만든 운동 흐름과 세트 기록을 처음 상태로 되돌릴까요?</p><div><button className="danger-button" onClick={() => { setResetConfirm(false); onResetSession(); }}>초기화 확정</button><button className="secondary-button" onClick={() => setResetConfirm(false)}>취소</button></div></> : <button className="reset-workout-button" onClick={() => setResetConfirm(true)}><RotateCcw size={16} />오늘 운동 초기화</button>}</div>;

  const parseCheckin = async () => {
    if (!checkinText.trim()) return;
    setAiBusy(true);
    try {
      const result = await onInterpretCheckin(checkinText);
      setCheckinResult(result);
      if (result.sleepDeprived) updatePreparation({ sleepHours: "5" });
      if (result.redFlag) updatePreparation({ redFlag: true });
      if (result.pain || result.soreness) updatePreparation({ painNote: [result.pain, result.soreness].filter(Boolean).join(" · ") });
    } catch (error) { setCheckinResult({ followUp: error.message }); }
    finally { setAiBusy(false); }
  };

  const applyQuickInput = () => {
    const result = classifyWorkoutInput(quickInput, exercise);
    if (result.requestedLoadChange) {
      const requested = result.requestedLoadChange;
      if (!requested.explicit && weight === "") { setInputMessage("먼저 기구에서 선택한 실제 보조 중량을 입력하세요."); return; }
      const assisted = loadBasisForExercise(exercise, session.context) === "assistance";
      const decrease = /(내려|감량|낮춰|줄여)/.test(quickInput);
      const refersToAssistance = assisted && /(보조|도움)/.test(quickInput);
      const direction = (refersToAssistance ? !decrease : decrease) ? "reduce_load" : "increase_load";
      const nextLoad = requested.explicit && requested.weight != null ? requested.weight : suggestLoadChange(direction, weight);
      if (nextLoad != null) {
        const reason = requested.explicit ? assisted ? "요청한 보조 중량을 다음 세트 권장값으로 반영했습니다." : "요청한 중량을 다음 세트 권장값으로 반영했습니다." : assisted ? direction === "increase_load" ? "보조 중량을 줄여 다음 세트 난이도를 높였습니다." : "보조 중량을 늘려 다음 세트 난이도를 낮췄습니다." : direction === "increase_load" ? "다음 세트 권장 중량을 한 단계 올렸습니다." : "다음 세트 권장 중량을 한 단계 낮췄습니다.";
        setInputRecommendation((current) => ({ ...current, weight: nextLoad, reason, source: "action", needsInitialLoad: false }));
        onChange({ ...session, exercises: session.exercises.map((item, index) => index === exerciseIndex ? { ...item, nextRecommendedWeight: nextLoad, nextRecommendedReason: reason } : item) });
        setInputMessage(`${nextLoad}${loadUnitForExercise(exercise, session.context)}를 다음 세트 권장값으로 계산했습니다. 아래 입력에서 확인하세요.`);
      } else setInputMessage("이 종목에서 적용할 수 있는 다음 중량을 계산하지 못했습니다.");
      return;
    }
    if (result.intent === "set_record" && result.setRecord) {
      if (result.setRecord.weight != null) setWeight(result.setRecord.weight);
      if (result.setRecord.reps != null) setReps(result.setRecord.reps);
      if (result.setRecord.durationSeconds != null) setDuration(result.setRecord.durationSeconds);
      const pieces = [result.setRecord.weight != null && `${result.setRecord.weight}kg`, result.setRecord.reps != null && `${result.setRecord.reps}회`, result.setRecord.durationSeconds != null && `${result.setRecord.durationSeconds}초`].filter(Boolean);
      setInputMessage(`${pieces.join(" · ")}로 입력했습니다. 아래 기록 버튼을 누르면 저장됩니다.`);
      return;
    }
    if (result.intent === "pain_or_form") {
      setSetStatus("pain"); setSetNote(quickInput);
      setInputMessage("통증 메모로 반영했습니다. 이 종목을 중단하거나 교체할 수 있습니다.");
      return;
    }
    if (["equipment_unavailable", "exercise_change"].includes(result.intent)) {
      setInputMessage("운동 순서·종목 편집에서 바로 교체할 수 있습니다."); setSheet("more"); return;
    }
    if (result.intent === "end_request") { setSheet("more"); return; }
    if (result.intent === "edit_previous" && exercise.completedSets?.length) {
      const prior = exercise.completedSets.at(-1);
      stopExerciseTimerNotification(); onChange(clearTimedActivity(session));
      setWeight(prior.weight || 0); setReps(prior.reps || 8); setDuration(prior.durationSeconds || 30); setDistance(prior.distance || 0); setRir(prior.rir || 2);
      setEditingPreviousSet(true); setInputMessage("직전 세트를 불러왔습니다. 값을 고친 뒤 저장하세요."); return;
    }
    setSetNote(quickInput);
    setInputMessage("운동 메모로 남깁니다. 중량과 반복은 ‘40키로 10개’처럼 입력해주세요.");
  };

  const recordGeneralWarmup = () => onChange({
    ...session,
    generalWarmup: { ...generalWarmup, completed: true, completedAt: new Date().toISOString() },
  });

  const finishWarmup = () => {
    stopExerciseTimerNotification();
    const next = clearTimedActivity(completeExerciseWarmup(session, exerciseIndex));
    beginRest(next, 60, "warmup");
    setSheet("rest");
    setQuickInput(""); setInputMessage(""); setSetNote("");
  };

  const completeSet = () => {
    if (exercise.measurement === "reps_weight" && (weight === "" || !Number.isFinite(Number(weight)) || Number(weight) < 0)) { setInputMessage("실제 중량을 입력하세요. 추가 중량이나 보조가 없는 경우 0을 직접 입력할 수 있어요."); return; }
    stopExerciseTimerNotification();
    const feedback = setFeedbackFromText(setNote || quickInput);
    const effectiveStatus = setStatus === "normal" && feedback.meaningful ? feedback.status : setStatus;
    const timed = isTimedExercise(exercise);
    const repRange = String(exercise.reps || "").match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
    const evaluationStatus = timed && effectiveStatus === "too_easy" ? "normal" : timed && effectiveStatus === "too_heavy" ? "target_missed" : effectiveStatus;
    const evaluation = evaluateSet({ status: evaluationStatus, repLower: timed ? 0 : repRange[0] || 0, repUpper: timed ? 0 : repRange.at(-1) || 0, rir: timed ? 2 : rir, reps: timed ? 0 : reps, sharpPain: feedback.pain, formFailure: feedback.formFailure, targetMiss: feedback.targetMiss, equipmentBusy: feedback.equipmentBusy, redFlag: Boolean(session.context?.readiness?.redFlag), remainingMinutes, fatigue: session.context?.readiness?.fatigue || 0, completedSets: exercise.completedSets?.length || 0, targetSets: exercise.sets });
    setRecommendation({ ...evaluation, feedbackApplied: feedback.meaningful }); setSelectedAction(evaluation.action);
    const record = {
      exerciseId: exercise.id, phase: "work",
      ...(exercise.measurement === "reps_weight" ? { weight } : {}),
      ...(["reps_weight", "bodyweight_reps", "unilateral"].includes(exercise.measurement) ? { reps } : {}),
      ...(["hold_seconds", "unilateral_hold_seconds", "timed_activity", "distance_time"].includes(exercise.measurement) ? { durationSeconds: duration } : {}),
      ...(exercise.measurement === "distance_time" ? { distance } : {}),
      rir: timed ? null : rir, note: setNote || quickInput, status: effectiveStatus, formFailure: effectiveStatus === "form_breakdown", pain: effectiveStatus === "pain", recommendation: evaluation.action,
      recommendationSnapshot: { weight: inputRecommendation?.needsInitialLoad ? null : Number(inputRecommendation?.weight) || 0, reps: Number(inputRecommendation?.reps) || 0, ...(timed ? { durationSeconds: Number(inputRecommendation?.durationSeconds) || 30 } : {}), reason: inputRecommendation?.reason || "목표 반복 범위 권장값", source: inputRecommendation?.source || "target", historyDate: inputRecommendation?.historyDate || null, locationId: session.context?.locationId || locationId || null, loadBasis: loadBasisForExercise(exercise, session.context), equipmentKey: equipmentKeyForExercise(exercise, session.context) },
      loadBasis: loadBasisForExercise(exercise, session.context),
      equipmentKey: equipmentKeyForExercise(exercise, session.context),
      locationId: session.context?.locationId || locationId || null,
      at: new Date().toISOString(),
    };
    const next = clearTimedActivity({ ...session, exercises: session.exercises.map((item, index) => {
      if (index !== exerciseIndex) return item;
      const previous = (item.completedSets || []).at(-1);
      const corrected = editingPreviousSet ? { ...previous, ...record, at: previous?.at || record.at, recommendationSnapshot: previous?.recommendationSnapshot || record.recommendationSnapshot, correctedAt: new Date().toISOString() } : null;
      return { ...item, nextRecommendedWeight: undefined, nextRecommendedReason: undefined, completedSets: editingPreviousSet ? [...(item.completedSets || []).slice(0, -1), corrected] : [...(item.completedSets || []), record] };
    }) });
    onChange(next);
    setQuickInput(""); setInputMessage(""); setSetNote(""); setSetStatus("normal");
    if (editingPreviousSet) { setEditingPreviousSet(false); return; }
    if (nextIncompleteIndex(next) === -1) {
      stopRestTimerNotification();
      setTimerRunning(false); setSheet("finished");
    } else {
      beginRest(next, Number(exercise.restSeconds ?? 120), "work"); setSheet("rest");
    }
  };

  const goNext = (source = session) => {
    const index = nextIncompleteIndex(source);
    const next = clearTimedActivity({ ...source, restTimer: null, ...(index >= 0 ? { activeExerciseIndex: index } : {}) });
    stopRestTimerNotification();
    onChange(next);
    setTimerRunning(false); setSheet(null);
    if (index >= 0) setExerciseIndex(index);
  };

  if (mode === "overview") return <div className="screen">
    <section className="card workout-overview-card"><span className="eyebrow">오늘 운동</span><div className="overview-title-row"><h1>{session.label === "REST" ? "휴식 권장" : session.label}</h1><span className="count-pill">{todayRestRecommended ? "회복일" : prepared ? `${session.exercises.length}개 운동` : "준비 전"}</span></div><p>{session.label === "REST" ? "오늘은 주기 끝 회복일입니다. 다음 운동을 확인하고 필요하면 오늘 운동을 선택하세요." : prepared ? "몸풀기부터 마지막 종목까지 한 흐름으로 기록합니다." : "오늘 쓸 시간과 운동 장소를 먼저 확인하세요."}</p>{todayRestRecommended && <p className="rest-recommendation-note">다음 운동은 {nextWorkoutType}입니다. 준비에서 오늘 운동을 바꿀 수 있어요.</p>}{prepared && <div className="overview-meta"><span><Clock3 size={16} />{session.context?.durationMinutes}분 계획</span><span>{completedSets}/{totalSets} 본세트</span></div>}{session.status === "complete" ? <p>오늘 운동을 완료했습니다.</p> : <button className="primary-button" onClick={() => setMode("prepare")}>운동 준비</button>}</section>
    {resetControl}
    {prepared && <PreparationFlow session={session} />}
  </div>;

  if (mode === "prepare") return <div className="screen full-screen-flow">
    <div className="flow-header"><button className="icon-button" onClick={() => setMode("overview")} aria-label="뒤로"><ChevronLeft /></button><h1>운동 준비</h1><span className="header-spacer" /></div>
    <section className="card program-card">
      <span className="eyebrow">운동 전 확인</span><h2>오늘 운동 설정</h2><p>오늘 쓸 시간과 장소, 컨디션만 확인하면 운동 흐름을 만듭니다.</p>
      <label className="session-type-label">오늘 운동 종류<select disabled={locked} value={sessionType} onChange={(event) => updatePreparation({ sessionType: event.target.value })}>{SPLITS[plan.split].sessions.map((type) => <option key={type}>{type}</option>)}</select></label>
      <label className="session-type-label">운동 가능 시간<select disabled={locked} value={durationMinutes} onChange={(event) => updatePreparation({ durationMinutes: event.target.value })}><option value="">시간 선택</option>{[30, 45, 60, 75, 90, 120].map((minutes) => <option value={minutes} key={minutes}>{minutes}분</option>)}</select></label>
      <label className="session-type-label">운동 장소<select disabled={locked} value={selectedLocation ? locationId : ""} onChange={(event) => updatePreparation({ locationId: event.target.value })}><option value="">장소 선택</option>{readyLocations.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      {selectedLocation ? <p className="location-equipment-note">{selectedLocation.name} · {selectedLocation.equipment.filter((item) => item !== "맨몸").join(" · ") || "맨몸 운동"}</p> : <p className="connection-note">프로필에서 저장한 장소만 선택할 수 있습니다.</p>}
      <details className="preparation-details"><summary>컨디션 추가 입력</summary><div className="readiness-fields"><label>수면 시간<select disabled={locked} value={sleepHours} onChange={(event) => updatePreparation({ sleepHours: event.target.value })}>{[4,5,6,7,8,9].map((n) => <option key={n} value={n}>{n}시간</option>)}</select></label><label>잔여 피로<select disabled={locked} value={fatigue} onChange={(event) => updatePreparation({ fatigue: Number(event.target.value) })}>{[0,1,2,3,4,5].map((n) => <option key={n} value={n}>{n} / 5</option>)}</select></label><label>통증이나 근육통<input disabled={locked} value={painNote} onChange={(event) => updatePreparation({ painNote: event.target.value })} placeholder="없으면 비워두세요" /></label><label className="toggle-row"><span>전신 이상 증상</span><input type="checkbox" disabled={locked} checked={redFlag} onChange={(event) => updatePreparation({ redFlag: event.target.checked })} /><i /></label><label>문장으로 입력<textarea value={checkinText} onChange={(event) => updatePreparation({ checkinText: event.target.value })} placeholder="예: 잠을 5시간 잤고 어깨가 조금 뻐근해요." /></label><button className="secondary-button" disabled={!aiConfigured || !checkinText.trim() || aiBusy} onClick={parseCheckin}>{aiBusy ? "정리 중…" : "AI로 컨디션 정리"}</button>{checkinResult?.followUp && <p className="connection-note" role="status">{checkinResult.followUp}</p>}</div></details>
      {todayRestRecommended && <p className="rest-recommendation-note">오늘은 주기 끝 회복일입니다. 다음 운동은 {nextWorkoutType}입니다. 위에서 오늘 운동을 선택할 수 있어요.</p>}
      {!locked && <button className="text-button" onClick={onManageLocations}>운동 장소 관리</button>}
      {locked ? <p className="connection-note">기록을 시작한 운동의 시간과 장소는 유지됩니다.</p> : <><button className="primary-button setup-generate" disabled={!durationMinutes || !selectedLocation || redFlag || (prepared && settingsMatch)} onClick={() => onPrepareSession({ type: sessionType, durationMinutes, locationId, readiness: { sleepHours: Number(sleepHours), sleepDeprived: Number(sleepHours) < 6, fatigue, painNote, redFlag, checkinText } })}>{prepared && !planMatches ? "최신 선호로 운동 다시 만들기" : prepared ? "운동 흐름 다시 만들기" : "운동 흐름 만들기"}</button>{prepareHint && <p className="connection-note" role="status">{prepareHint}</p>}</>}
      <button className="text-button" onClick={onOpenProgram}>운동 원칙을 AI로 수정</button>
    </section>
    {resetControl}
    {prepared && <PreparationFlow session={session} onEdit={onEditSession} />}
    <div className="sticky-action"><button className="primary-button" disabled={!prepared || !settingsMatch} onClick={() => { const index = Math.max(0, nextIncompleteIndex(session)); const now = Date.now(); setExerciseIndex(index); const resumed = resumeSessionTimer(resumeTimedActivity({ ...session, activeExerciseIndex: index }, now), now); onChange(resumed); if (resumed.timedExerciseTimer?.running) startExerciseTimerNotification(Math.max(1, Number(resumed.timedExerciseTimer.targetSeconds) - Number(resumed.timedExerciseTimer.elapsedSeconds || 0)), resumed.exercises[index]?.name); setNowMs(now); setMode("active"); }}>운동 시작</button></div>
  </div>;

  if (!exercise) return <div className="screen"><p>먼저 오늘 운동을 구성해주세요.</p><button className="secondary-button" onClick={() => setMode("prepare")}>운동 준비</button></div>;

  const currentWorkSet = Math.min((exercise.completedSets?.length || 0) + 1, exercise.sets);
  const needsExerciseChoice = phase !== "body" && !exercise.warmupCompleted && !exercise.warmupSkipped && (exercise.completedWarmups?.length || 0) === 0 && (exercise.completedSets?.length || 0) === 0 && !exercise.startConfirmed;
  const restGoal = getRestPreview(session, history);
  return <div className="screen workout-active-screen">
    <div className="session-header"><button className="icon-button" onClick={() => pauseWorkout(false)} aria-label="운동 화면 나가기"><ChevronLeft size={20} /></button><div><span>{session.label} · {session.context?.durationMinutes}분 계획</span><strong>{timeLabel(elapsedSeconds)} 경과</strong></div><button className="icon-button" onClick={() => setSheet("more")} aria-label="운동 옵션"><MoreHorizontal /></button></div>
    <WorkoutRoute session={session} groups={groups} exerciseIndex={exerciseIndex} onSelect={selectExercise} progress={progress} progressPercent={progressPercent} elapsedSeconds={elapsedSeconds} remainingSeconds={remainingSeconds} />

    {phase === "body" && <section className="card active-step-card"><span className="step-kicker">1단계 · {session.label} 몸풀기</span><h1>맨몸 준비운동</h1><p>{generalWarmup.goal}</p><ol className="warmup-exercise-list">{generalWarmup.exercises.map((item) => <li key={item}>{item}</li>)}</ol><p className="warmup-next-note">끝나면 첫 종목의 가벼운 워밍업 세트로 넘어갑니다.</p><button className="primary-button" onClick={recordGeneralWarmup}>몸풀기 완료</button></section>}
    {phase === "warmup" && !needsExerciseChoice && <section className="card active-step-card"><span className="step-kicker">{exercise.target} · 워밍업</span><h1>{exercise.name}</h1><p>{warmupDecision(exercise, session.exercises.slice(0, exerciseIndex)).reason}</p><WarmupRecommendations exercise={exercise} history={history} session={session} completed={warmupCompleted} target={warmupTarget} /><div className="step-actions"><button className="secondary-button" onClick={() => onChange({ ...session, exercises: session.exercises.map((item, index) => index === exerciseIndex ? { ...item, warmupSkipped: true } : item) })}>바로 본세트</button><button className="primary-button" onClick={finishWarmup}>워밍업 완료</button></div></section>}
    {needsExerciseChoice && <section className="card exercise-choice-card"><span className="step-kicker">워밍업 전 종목 확인</span><h1>{exercise.name}</h1><p>{exercise.target}{exercise.pattern ? ` · ${TRAINING_PATTERNS[exercise.pattern] || BACK_PATTERN_LABELS[exercise.pattern] || exercise.target}` : ""} 운동입니다. 기구를 사용하기 전에 이 종목을 진행할지 확인하세요.</p>{exercise.variant && <p>{exercise.variant.grip} · {exercise.variant.elbowPath} · {exercise.variant.emphasis} 중심</p>}<div className="exercise-choice-actions"><button className="secondary-button" disabled={!alternatives.length} onClick={() => setSheet("replace")}>다른 종목 보기</button><button className="primary-button" onClick={confirmExerciseStart}>{warmupTarget ? "이 종목으로 워밍업" : "이 종목 시작"}</button></div>{!alternatives.length && <small>현재 장소에서 같은 부위·동작 범위의 다른 종목이 없습니다.</small>}</section>}
    {phase === "work" && !needsExerciseChoice && <>
      <section className="exercise-hero"><span className="step-kicker">{exercise.target} · 본세트 {currentWorkSet}/{exercise.sets}</span><h1>{exercise.name}</h1><p>{exercise.equipment} · 권장 {exercise.reps}{!isTimedExercise(exercise) && " · RIR 1~3"}</p>{exercise.setAdjustmentReason && <small className="set-adjustment-note">{exercise.setAdjustmentReason}</small>}</section>
      {(exercise.completedSets?.length || 0) > 0 && <section className="previous-set"><span className="check-mark">✓</span><div><strong>직전 세트</strong><small>{setLabel(exercise.completedSets.at(-1), exercise.measurement, exercise)}{exercise.completedSets.at(-1).rir == null ? "" : ` · RIR ${exercise.completedSets.at(-1).rir}`}</small></div><button className="text-button" onClick={() => { const prior = exercise.completedSets.at(-1); stopExerciseTimerNotification(); onChange(clearTimedActivity(session)); setWeight(prior.weight || 0); setReps(prior.reps || 8); setDuration(prior.durationSeconds || 30); setDistance(prior.distance || 0); setRir(prior.rir || 2); setEditingPreviousSet(true); }}>수정</button></section>}
      <section className="card set-entry-card">{isTimedExercise(exercise) && <TimedActivityControl timer={activeTimedTimer} elapsed={timedElapsed} target={activeTimedTimer?.targetSeconds || duration} side={exercise.measurement === "unilateral_hold_seconds" ? timedSide : null} setSide={setTimedSide} onStart={startTimedActivity} onPause={pauseTimedControl} onFinish={finishTimedActivity} />}<SetEntry exercise={exercise} context={session.context} weight={weight} setWeight={setWeight} reps={reps} setReps={setReps} duration={duration} setDuration={setDuration} distance={distance} setDistance={setDistance} quickInput={quickInput} setQuickInput={setQuickInput} onApplyQuickInput={applyQuickInput} inputMessage={inputMessage} recommendation={inputRecommendation} onApplyRecommendation={() => { setWeight(inputRecommendation?.weight ?? weight); setReps(inputRecommendation?.reps ?? reps); }} />{!isTimedExercise(exercise) && <div className="rir-control"><div className="control-label"><span>남은 반복 여력</span><small>RIR</small></div><div className="rir-options">{[0,1,2,3,4,5].map((value) => <button key={value} className={rir === value ? "selected" : ""} onClick={() => setRir(value)}>{value}</button>)}</div></div>}<details className="set-details"><summary>상태와 메모</summary><label className="set-status-label">세트 상태<select value={setStatus} onChange={(event) => setSetStatus(event.target.value)}><option value="normal">정상</option><option value="too_easy">너무 쉬움</option><option value="too_heavy">너무 무거움</option><option value="target_missed">목표 자극 이상</option><option value="form_breakdown">폼 무너짐</option><option value="pain">통증</option></select></label><textarea value={setNote} onChange={(event) => setSetNote(event.target.value)} placeholder="필요한 내용만 메모" /></details></section>
      <div className="sticky-action active-action">{(exercise.completedSets?.length || 0) >= exercise.sets && exercise.sets < (exercise.maximumSets || exercise.sets) && <button className="secondary-button" onClick={() => onChange({ ...session, exercises: session.exercises.map((item, index) => index === exerciseIndex ? { ...item, sets: item.sets + 1 } : item) })}>추가 세트 ({exercise.sets}/{exercise.maximumSets})</button>}<button className="primary-button" disabled={(exercise.completedSets?.length || 0) >= exercise.sets && !editingPreviousSet} onClick={completeSet}>{editingPreviousSet ? "수정한 세트 저장" : `${currentWorkSet}세트 기록`}</button></div>
    </>}

    {sheet === "more" && <Modal title="운동 중 할 일" onClose={() => setSheet(null)}><div className="sheet-menu"><button onClick={() => { setSheet(null); onEditSession(); }}>운동 순서·종목 편집</button><button onClick={() => { const now = Date.now(); setSheet(null); stopExerciseTimerNotification(); onChange(pauseTimedActivity(pauseSessionTimer(session, now), now)); setNowMs(now); setMode("overview"); onOpenProgram(); }}>운동 원칙을 AI로 수정</button><button onClick={() => { setSheet(null); pauseWorkout(true); }}>운동 시간 멈추고 홈으로</button><button onClick={() => { setSheet(null); stopRestTimerNotification(); finishWorkout("complete", { endedEarly: true, completionReason: "시간 부족 또는 사용자 종료" }); }}>여기까지 저장하고 오늘 운동 종료</button></div></Modal>}
    {sheet === "replace" && <Modal title={`${exercise.name} 바꾸기`} onClose={() => setSheet(null)}><p className="sheet-description">{exercise.kind === "back" ? "같은 당기기 범위와 이 기구의 다른 그립을 표시합니다." : `${exercise.target} 종목만 표시합니다.`}</p><div className="replacement-list">{alternatives.map((candidate) => <button key={candidate.id} onClick={() => { onReplaceExercise(exerciseIndex, candidate.id); setSheet(null); }}><strong>{candidate.name}</strong><small>{candidate.equipment} · {candidate.reps}{candidate.variant ? ` · ${candidate.variant.emphasis}` : ""}</small></button>)}</div>{!alternatives.length && <p className="empty-copy">현재 장소에 저장된 기구로 가능한 대체 종목이 없습니다.</p>}<button type="button" className="secondary-button replacement-manage-location" onClick={() => { setSheet(null); onManageLocations?.(); }}>이 장소의 기구 수정</button></Modal>}
    {sheet === "rest" && <Modal title={session.restTimer?.kind === "warmup" ? "워밍업 후 휴식" : "휴식"} onClose={finishRest}><div className="rest-timer">{timeLabel(restSeconds)}</div>{restGoal?.complete ? <section className="rest-goal-preview complete"><span>다음 목표</span><strong>오늘 운동의 모든 세트가 끝났어요</strong></section> : restGoal && <section className="rest-goal-preview" aria-label="다음 운동 목표"><div className="rest-goal-heading"><span>{restGoal.exercise.target} · {restGoal.stage === "choice" ? "종목 확인 후 진행" : restGoalLabel(restGoal)}</span><small>{restGoal.stage === "choice" ? `확인 후 ${restGoal.phase === "warmup" ? "워밍업" : "본세트"}` : restGoal.phase === "warmup" ? "다음 워밍업" : "다음 본세트"}</small></div><strong className="rest-goal-name">{restGoal.exercise.name}</strong><p>{formatRestTargetDetails(restGoal, session.context)}</p>{restGoal.recommendation?.reason && <small className="rest-goal-note">{restGoal.recommendation.reason}</small>}{restGoal.phase === "warmup" && <small className="rest-goal-note">{warmupDecision(restGoal.exercise, session.exercises.slice(0, restGoal.index)).reason}</small>}</section>}<p className="next-set">상태바에서도 남은 휴식 시간을 확인할 수 있습니다.</p><div className="timer-actions"><button onClick={timerRunning ? pauseRest : resumeRest}><TimerReset size={18} />{timerRunning ? "일시정지" : "계속"}</button><button onClick={extendRest}>+30초</button><button onClick={finishRest}>{session.restTimer?.kind === "warmup" ? phase === "warmup" ? "다음 워밍업" : "첫 본세트" : "다음 판단"}</button></div></Modal>}
    {sheet === "next_action" && <Modal title="다음 행동" onClose={() => goNext()}><div className="next-action-summary">{recommendation?.feedbackApplied && <span className="eyebrow">상태·메모 반영됨</span>}<strong>{recommendation?.reason}</strong><p>{shouldEndExercise(exercise, session, { remainingMinutes, fatigue: session.context?.readiness?.fatigue || 0 }).reason}</p></div><label className="set-status-label">다음 행동<select value={selectedAction} onChange={(event) => setSelectedAction(event.target.value)}>{(isTimedExercise(exercise) ? [["maintain","같은 시간으로 계속"],["change_tempo","템포 조절"],["retest_form","자세 다시 확인"],["replace_exercise","종목 교체"],["end_exercise","이 종목 종료"],["end_session","전체 운동 종료"]] : [["maintain",loadBasisForExercise(exercise, session.context) === "assistance" ? "같은 보조 중량으로 계속" : "같은 중량으로 계속"],["increase_load",loadBasisForExercise(exercise, session.context) === "assistance" ? "보조 중량 줄이기 · 더 어렵게" : "중량 올리기"],["reduce_load",loadBasisForExercise(exercise, session.context) === "assistance" ? "보조 중량 늘리기 · 더 쉽게" : "중량 낮추기"],["change_tempo","템포 조절"],["retest_form","자세 다시 확인"],["replace_exercise","종목 교체"],["end_exercise","이 종목 종료"],["end_session","전체 운동 종료"]]).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="primary-button" onClick={applyNextAction}>적용하고 계속</button></Modal>}
    {sheet === "finished" && <Modal title="오늘 운동 완료" onClose={() => setSheet(null)}><p>{session.exercises.length}개 운동에서 본세트 {totalSets}개를 기록했습니다.</p><p>총 운동 시간 {timeLabel(elapsedSeconds)} · 유산소 판단: {cardioRecommendation(session.label, { fatigue: session.context?.readiness?.fatigue || 0, remainingMinutes }).label}</p><details className="set-details"><summary>다음 회차 중량 판단</summary>{session.exercises.map((item) => <p key={item.id}>{item.name}: {nextSessionLoad(item.completedSets, { repUpper: Number(item.reps.split("~").at(-1)) || 12, targetSets: item.targetSets || item.sets }).reason}</p>)}</details><button className="primary-button" onClick={() => { setSheet(null); finishWorkout("complete"); }}>기록 저장하고 종료</button></Modal>}
  </div>;
}

function WarmupRecommendations({ exercise, history, session, completed, target }) {
  const suggestions = Array.from({ length: Math.max(0, target - completed) }, (_, offset) => ({
    index: completed + offset,
    recommendation: recommendedSetInput(exercise, history, { phase: "warmup", warmupIndex: completed + offset, context: session.context, currentSession: session }),
  }));
  const missingLoad = suggestions.some(({ recommendation }) => recommendation.needsInitialLoad);
  return <><p className="connection-note">본세트 기록을 기준으로 추천합니다. 준비 세트 사이에는 약 60초 쉬세요.</p><ol className="warmup-recommendations">{suggestions.map(({ index, recommendation }) => <li key={index}><strong>준비 {index + 1}세트</strong>{exercise.measurement === "reps_weight" && <label><input aria-label={"준비 " + (index + 1) + "세트 추천 중량"} value={recommendation.weight ?? ""} readOnly tabIndex={-1} /><span>{loadUnitForExercise(exercise, session.context)}</span></label>}<span>{isTimedExercise(exercise) ? (recommendation.durationSeconds || 30) + "초" : recommendation.reps + "회"}</span></li>)}</ol>{missingLoad && <p className="connection-note">본세트 기록이 없어 추천 중량을 비워뒀어요. 첫 본세트를 저장하면 다음 운동부터 추천합니다.</p>}</>;
}

function PreparationFlow({ session, onEdit }) {
  const groups = workoutFlowGroups(session);
  const warmup = session.generalWarmup?.exercises?.length >= 4 ? session.generalWarmup : generalWarmupForType(session.label);
  return <section className="card exercise-list-card"><div className="section-heading"><div><span className="eyebrow">오늘의 순서</span><h2>운동 흐름</h2></div>{onEdit && <button className="text-button" onClick={onEdit}>순서·종목 편집</button>}</div>{session.estimatedSeconds != null && <p className="connection-note">몸풀기·휴식 포함 약 {Math.ceil(session.estimatedSeconds / 60)}분 / 가능 시간 {session.context?.durationMinutes}분. 실제 수행 속도에 따라 달라질 수 있어요.</p>}{session.timeOverrun && <p className="form-error" role="status">우선 운동의 최소 세트를 지키면 시간이 초과됩니다. 시간을 늘리거나 순서·종목을 조정하세요.</p>}{session.deferredExercises?.length > 0 && <p className="connection-note">시간에 맞춰 제외: {session.deferredExercises.map((item) => item.name).join(" · ")}</p>}<div className="preparation-flow"><div className="preparation-stage"><span>1</span><div><strong>{session.label} 맨몸 몸풀기</strong><small>{warmup.exercises.slice(0, 3).join(" · ")} 외 {Math.max(0, warmup.exercises.length - 3)}개</small></div></div>{groups.map((group) => <div className="preparation-group" key={group.label}><h3>{group.label}</h3>{group.exercises.map((item) => <div className="preparation-stage" key={`${item.id}-${item.index}`}><span>{item.index + 2}</span><div><strong>{item.name}</strong><small>워밍업 {exerciseWarmupTarget(item, session.exercises.slice(0, item.index))}세트 · 본세트 {item.sets}세트{item.setAdjustmentReason ? ` · ${item.setAdjustmentReason}` : ""}</small></div></div>)}</div>)}</div></section>;
}

function WorkoutRoute({ session, groups, exerciseIndex, onSelect, progress, progressPercent, elapsedSeconds, remainingSeconds }) {
  const [expanded, setExpanded] = useState(false);
  return <section className={`card workout-route ${expanded ? "expanded" : "collapsed"}`}><button className="route-toggle" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><div className="route-summary"><div><span className="eyebrow">전체 운동 흐름</span><h2>{progress.completed}/{progress.total}단계 완료</h2></div><strong>{progressPercent}%</strong></div>{expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button><div className="session-progress-track"><i style={{ width: `${progressPercent}%` }} /></div>{expanded && <><div className="session-time-row"><span>경과 {timeLabel(elapsedSeconds)}</span><span>{remainingSeconds >= 0 ? `남은 계획 ${timeLabel(remainingSeconds)}` : `계획 초과 ${timeLabel(Math.abs(remainingSeconds))}`}</span></div><div className="route-list"><div className={`route-item body ${session.generalWarmup?.completed ? "done" : "current"}`}><i /><div><strong>몸풀기</strong><small>{session.generalWarmup?.completed ? "완료" : "진행 전"}</small></div></div>{groups.map((group) => <div className="route-group" key={group.label}><h3>{group.label}</h3>{group.exercises.map((item) => { const warmups = completedWarmupCount(item, session.exercises.slice(0, item.index)); const target = exerciseWarmupTarget(item, session.exercises.slice(0, item.index)); const works = item.completedSets?.length || 0; const done = item.skipped || works >= item.sets; return <button key={`${item.id}-${item.index}`} className={`route-item ${item.index === exerciseIndex ? "current" : ""} ${done ? "done" : ""}`} onClick={() => onSelect(item.index)}><i /><div><strong>{item.name}</strong><small>{target ? `워밍업 ${Math.min(warmups, target)}/${target} · ` : ""}본세트 {works}/{item.sets}</small></div><span>{done ? "완료" : item.index === exerciseIndex ? "현재" : "대기"}</span></button>; })}</div>)}</div></>}</section>;
}

function isTimedExercise(exercise) {
  return ["hold_seconds", "unilateral_hold_seconds", "timed_activity"].includes(exercise?.measurement);
}

function loadBasisForExercise(exercise, context = {}) {
  return getProgramLoadBasis(exercise || {}, context);
}

function loadUnitForExercise(exercise, context) {
  const basis = loadBasisForExercise(exercise, context);
  if (basis === "per_hand") return "kg/손";
  if (basis === "per_side") return "kg/편측";
  if (basis === "assistance") return "kg(보조)";
  if (basis === "total_on_bar" || (basis === "total" && exercise?.equipment === "바벨")) return "kg(총중량)";
  return "kg";
}

function TimedActivityControl({ timer, elapsed = 0, target = 30, side, setSide, showSide = false, onStart, onPause, onFinish }) {
  const remaining = Math.max(0, Number(target) - Number(elapsed));
  const done = Boolean(timer?.finishedAt);
  return <section className="timed-activity-control" aria-label="운동 타이머">
    <div className="timed-activity-heading"><span>목표 시간 {timeLabel(target)}</span>{showSide && side && <div className="timed-side-toggle"><button className={side === "왼쪽" ? "selected" : ""} onClick={() => setSide("왼쪽")}>왼쪽</button><button className={side === "오른쪽" ? "selected" : ""} onClick={() => setSide("오른쪽")}>오른쪽</button></div>}</div>
    <strong className="timed-activity-clock">{timeLabel(elapsed)}</strong>
    <p>{done ? `실제 ${timeLabel(timer.elapsedSeconds)} · 입력값에 반영됨` : remaining ? `남은 시간 ${timeLabel(remaining)}` : "목표 시간에 도달했어요"}</p>
    <div className="timed-activity-actions">{done ? <button className="secondary-button" onClick={onStart}>다시 시작</button> : <button className="secondary-button" onClick={timer?.running ? onPause : onStart}>{timer?.running ? "일시정지" : elapsed ? "계속" : "시작"}</button>}{!done && <button className="primary-button" disabled={!timer} onClick={onFinish}>실제 시간 입력</button>}</div>
  </section>;
}

function SetEntry({ exercise, weight, setWeight, reps, setReps, duration, setDuration, distance, setDistance, quickInput, setQuickInput, onApplyQuickInput, inputMessage, recommendation, onApplyRecommendation, context, compact = false }) {
  const placeholder = ["hold_seconds", "unilateral_hold_seconds", "timed_activity"].includes(exercise.measurement) ? "예: 45초 했어" : exercise.measurement === "distance_time" ? "예: 500미터 120초" : ["bodyweight_reps", "unilateral"].includes(exercise.measurement) ? "예: 15개 했어" : "예: 40키로 10개 했어";
  const assistance = loadBasisForExercise(exercise, context) === "assistance";
  const weightLabel = assistance ? "실제 보조 중량" : exercise.loadLabel || "실제 기록 중량";
  return <div className={`set-entry ${compact ? "compact" : ""}`}><label className="quick-log-label"><span>말하듯 기록</span><div className="quick-log-row"><input value={quickInput} onChange={(event) => setQuickInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onApplyQuickInput(); } }} placeholder={placeholder} /><button onClick={onApplyQuickInput} disabled={!quickInput.trim()}>반영</button></div></label>{inputMessage && <p className="input-feedback" role="status">{inputMessage}</p>}{assistance && <p className="input-feedback">기구에 표시된 보조 중량을 기록하세요. 낮을수록 더 어렵고, 0kg는 도움 없이 수행한 기록입니다.</p>}{exercise.loadLabel && !assistance && <p className="input-feedback">양쪽에 추가한 원판의 합계만 기록하세요. 봉·기구 자체 무게는 제외합니다.</p>}{recommendation?.needsInitialLoad && <p className="input-feedback">이 종목의 중량 기록이 없어 숫자를 추천하지 않았어요. 실제로 선택한 중량을 입력하세요.</p>}{recommendation && !recommendation.needsInitialLoad && exercise.measurement === "reps_weight" && <div className="set-recommendation"><div><strong>권장 {recommendation.weight || 0}{loadUnitForExercise(exercise, context)} · {recommendation.reps || 0}회</strong><small>{recommendation.reason || "최근 기록과 운동 목표를 바탕으로 제안"}</small></div><button type="button" onClick={onApplyRecommendation}>추천 적용</button></div>}<div className="direct-entry-grid">{exercise.measurement === "reps_weight" && <NumberField label={weightLabel} unit={loadUnitForExercise(exercise, context)} value={weight} onChange={setWeight} decimal />}{["reps_weight", "bodyweight_reps", "unilateral"].includes(exercise.measurement) && <NumberField label="실제 반복" unit={exercise.measurement === "unilateral" ? "회/편측" : "회"} value={reps} onChange={setReps} />}{["hold_seconds", "unilateral_hold_seconds", "timed_activity", "distance_time"].includes(exercise.measurement) && <NumberField label="실제 시간" unit={exercise.measurement === "unilateral_hold_seconds" ? "초/편측" : "초"} value={duration} onChange={setDuration} />}{exercise.measurement === "distance_time" && <NumberField label="실제 거리" unit="m" value={distance} onChange={setDistance} decimal />}</div></div>;
}

function NumberField({ label, unit, value, onChange, decimal = false }) {
  return <label className="number-field"><span>{label}</span><div><input type="number" min="0" step={decimal ? "0.5" : "1"} inputMode={decimal ? "decimal" : "numeric"} value={value} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} /><b>{unit}</b></div></label>;
}
