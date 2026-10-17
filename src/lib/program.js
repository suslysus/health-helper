import { EXERCISES, EQUIPMENT_CATALOG, exerciseMuscleRoles } from "./exerciseCatalog.js";
export { EXERCISES, EQUIPMENT_CATALOG, exerciseMuscleRoles } from "./exerciseCatalog.js";
import { dateDistance, localDateKey } from "./dates.js";
import { exerciseRecords, historyThroughDate, historyFingerprint, recordedExercises, normalizeExerciseRecord } from "./workoutHistory.js";
import { currentTrainingRules, inferPatternSessions, normalizeTrainingRules } from "./trainingRules.js";

export const SPLITS = {
  full_body: { label: "전신", sessions: ["전신 A", "전신 B", "전신 C"] },
  upper_lower: { label: "상·하체", sessions: ["상체 A", "하체 A", "상체 B", "하체 B"] },
  ppl: { label: "PPL", sessions: ["PUSH", "PULL", "LEGS"] },
  hybrid: { label: "혼합형", sessions: ["전신", "상체", "하체", "선호 부위"] },
};



export const EQUIPMENT = ["맨몸", "덤벨", "바벨", "케이블", "철봉", "머신"];
export const DEFAULT_LOCATIONS = [];



function equipmentAliasMatches(item, value) {
  const normalizedValue = normalizedPhrase(value);
  if (!normalizedValue) return false;
  if (item.id === "machine") return ["머신", "웨이트머신", "기타머신"].includes(normalizedValue);
  if (item.id === "squat_machine" && /(스쿼트랙|파워랙|랙|바벨|barbell)/i.test(normalizedValue)) return false;
  // The legacy generic curl remains available for old place settings and records,
  // while explicit lying/prone and seated names map only to their own machine.
  if (item.id === "leg_curl" && /(프론|라잉|라이잉|prone|lying|시티드|seated)/i.test(normalizedValue)) return false;
  return item.aliases.some((alias) => {
    const normalizedAlias = normalizedPhrase(alias);
    return normalizedValue.includes(normalizedAlias);
  });
}

export function normalizeLocationEquipment(location = {}) {
  const input = [...new Set([...(location.equipment || []), ...(location.equipmentItems || []).flatMap((item) => [item.label, ...(item.variants || [])])].map((item) => String(item || "").trim()).filter(Boolean))];
  const configuredItems = new Map((location.equipmentItems || []).map((item) => [item.id, item]));
  const equipmentItems = EQUIPMENT_CATALOG.filter((item) => input.some((value) => equipmentAliasMatches(item, value)))
    .map((item) => {
      const configured = configuredItems.get(item.id) || {};
      return {
        ...configured,
        id: item.id,
        label: item.label,
        variants: input.filter((value) => equipmentAliasMatches(item, value)),
        loadSteps: configured.loadSteps || item.loadSteps || [],
        availableLoads: configured.availableLoads || item.availableLoads || [],
        loadBasis: configured.loadBasis || item.loadBasis || "",
        exerciseIds: item.exerciseIds || [],
      };
    });
  const customItems = input.filter((value) => !equipmentItems.some((item) => item.variants.includes(value)))
    .map((label, index) => ({ id: `custom-${index}-${label.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-")}`, label, variants: [label], loadSteps: [], exerciseIds: [] }));
  const normalizedItems = [...equipmentItems, ...customItems];
  const equipment = [...new Set(input.map((value) => normalizedItems.find((item) => item.variants.includes(value))?.label || value))];
  return { equipmentItems: normalizedItems, equipment };
}

export function sessionContract(type, options = {}) {
  const base = type === "PUSH" ? { label: type, requiredGroups: ["가슴", "삼두", "어깨"], allowedKinds: ["push"], restAfter: false }
    : type === "PULL" ? { label: type, requiredGroups: ["등", "이두", ...(options.pullForearms ? ["전완"] : [])], allowedKinds: ["back", "biceps", ...(options.pullForearms ? ["forearms"] : [])], restAfter: false }
      : type === "LEGS" ? { label: type, requiredGroups: ["하체", "복근"], allowedKinds: ["legs", "core"], restAfter: true }
        : { label: type, requiredGroups: [], allowedKinds: null, restAfter: false };
  if (!base.allowedKinds || !options.patternSessions) return base;
  const assigned = Object.entries(options.patternSessions).filter(([, session]) => session === type).map(([pattern]) => pattern);
  const exercises = EXERCISES.filter((item) => assigned.includes(item.pattern));
  return { ...base, requiredGroups: [...new Set([...base.requiredGroups, ...exercises.map((item) => item.target)])], allowedKinds: [...new Set([...base.allowedKinds, ...exercises.map((item) => item.kind)])] };
}

export const BACK_PATTERNS = ["vertical_pull", "horizontal_pull", "upper_back", "lat_isolation"];
export const BACK_PATTERN_LABELS = {
  vertical_pull: "수직 당기기", horizontal_pull: "수평 당기기",
  upper_back: "상부 등·두께", lat_isolation: "광배 고립",
};
export const SET_STATUSES = ["normal", "too_easy", "too_heavy", "target_missed", "form_breakdown", "pain"];

const GENERAL_WARMUPS = {
  PUSH: {
    exercises: ["팔 크게 돌리기 앞·뒤 각 10회", "어깨 으쓱했다 내리기 10회", "스캡 푸시업 10~12회", "벽 푸시업 또는 무릎 푸시업 8~10회", "가슴 열기 동적 스트레칭 좌우 10회", "팔을 뒤로 보내 가슴 앞쪽 늘리기 20초", "손목 돌리기 좌우 10회씩"],
    goal: "오래 늘이는 정적 스트레칭보다 어깨와 견갑을 움직여 프레스 동작을 준비합니다.",
  },
  PULL: {
    exercises: ["팔 크게 돌리기 앞·뒤 각 10회", "어깨 으쓱했다 내리기 10회", "캣카우 8~10회", "스캡 풀업 또는 서서 견갑 내리기 8~10회", "엎드린 Y-T 레이즈 각 8회", "광배 동적 스트레칭 좌우 10회", "손목 돌리기 좌우 10회씩"],
    goal: "견갑을 위아래와 뒤쪽으로 움직여 당기기 동작을 준비합니다.",
  },
  LEGS: {
    exercises: ["제자리 걷기 또는 가볍게 뛰기 60초", "고관절 돌리기 좌우 10회", "맨몸 힙힌지 10회", "맨몸 스쿼트 10~12회", "교대 리버스 런지 좌우 6회", "글루트 브리지 10회", "발목 앞뒤 가동성 좌우 10회"],
    goal: "체온을 올리고 고관절·무릎·발목을 움직여 하체 운동 범위를 준비합니다.",
  },
  DEFAULT: {
    exercises: ["제자리 걷기 60초", "팔 크게 돌리기 앞·뒤 각 10회", "고관절 돌리기 좌우 10회", "스캡 푸시업 8~10회", "맨몸 스쿼트 10회", "손목과 발목 돌리기 좌우 10회"],
    goal: "체온을 올리고 오늘 사용할 관절을 동적으로 움직입니다.",
  },
};

export function generalWarmupForType(type = "") {
  const value = String(type).toUpperCase();
  if (value === "REST") return { exercises: [], goal: "회복일입니다." };
  if (value === "PUSH" || value.includes("가슴") || value.includes("상체")) return GENERAL_WARMUPS.PUSH;
  if (value === "PULL" || value.includes("등")) return GENERAL_WARMUPS.PULL;
  if (value === "LEGS" || value.includes("하체")) return GENERAL_WARMUPS.LEGS;
  return GENERAL_WARMUPS.DEFAULT;
}

export function sessionElapsedSeconds(session, nowMs = Date.now()) {
  const base = Math.max(0, Number(session?.elapsedSeconds) || 0);
  const activeAt = session?.activeStartedAt ? new Date(session.activeStartedAt).getTime() : NaN;
  return Number.isFinite(activeAt) ? base + Math.max(0, Math.floor((nowMs - activeAt) / 1000)) : base;
}

export function resumeSessionTimer(session, nowMs = Date.now()) {
  const at = new Date(nowMs).toISOString();
  return { ...session, startedAt: session?.startedAt || at, activeStartedAt: at, elapsedSeconds: Math.max(0, Number(session?.elapsedSeconds) || 0) };
}

export function pauseSessionTimer(session, nowMs = Date.now()) {
  return { ...session, elapsedSeconds: sessionElapsedSeconds(session, nowMs), activeStartedAt: null, pausedAt: new Date(nowMs).toISOString() };
}

export function replacementOptions(current, available = [], selected = []) {
  if (!current) return [];
  const used = new Set(selected.map((item) => item.id));
  return available.filter((candidate) => candidate.id !== current.id && !used.has(candidate.id) && (
    current.pattern
      ? (candidate.target === current.target && (
        candidate.pattern === current.pattern
        || (current.baseExerciseId || current.id) === (candidate.baseExerciseId || candidate.id)
      )) || ([current.pattern, candidate.pattern].includes("hip_abduction") && [current.pattern, candidate.pattern].includes("glute_extension"))
      : candidate.target === current.target
  ));
}

export function classifyWorkoutInput(text = "", exerciseContext = {}) {
  const original = String(text).trim();
  const value = original.replace(/(\d)\s*[,，]\s*(\d)/g, "$1.$2");
  const rules = [
    ["end_request", /(끝낼게|종료|마칠게|그만할래|운동 끝)/],
    ["pain_or_form", /(아프|통증|찝힘|저림|폼|자세|불편)/],
    ["equipment_unavailable", /(기구.*(사용 중|비었|없|못 쓰)|사용 중|기다려|고장)/],
    ["edit_previous", /(직전|방금|이전).*(수정|잘못|정정)|기록을? 고쳐/],
    ["exercise_change", /(대체|바꿔|다른 운동|운동 변경)/],
    ["load_change", /(중량|무게).*(올려|내려|증량|감량)|(?:올려줘|내려줘|증량|감량)|(?:\d+(?:\.\d+)?\s*(?:kg|키로).*(?:올려|내려))/],
    ["set_record", /(빈\s*봉|빈봉|\d+\s*(회|개|초|reps?)|\d+(?:\.\d+)?\s*(kg|키로)|세트 기록|세트 완료)/i],
    ["question", /[?？]|(왜|어떻게|얼마나|무엇|뭐|어떤|다음에|추천|알려줘)/],
  ];
  const match = rules.find(([, pattern]) => pattern.test(value));
  const intent = match?.[0] || "unclear";
  const repsMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:회|개|reps?)/i);
  const weightMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:kg|키로)/i);
  const reps = repsMatch ? Number(repsMatch[1]) : null;
  let weight = weightMatch ? Number(weightMatch[1]) : null;
  if (weight === null && /(빈\s*봉|빈봉)/.test(value)) {
    const barbellBase = exerciseContext.barbellBaseWeight ?? (["bench", "squat"].includes(exerciseContext.id) ? 20 : null);
    weight = barbellBase == null ? null : Number(barbellBase);
  }
  const durationMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:초|seconds?)/i);
  const durationSeconds = durationMatch ? Number(durationMatch[1]) : null;
  const requestsLoadChange = intent === "load_change";
  return { intent, confidence: match ? (value.length > 2 ? 0.86 : 0.62) : 0.35, requiresConfirmation: !match || value.length < 3, text: original, setRecord: intent === "set_record" ? { reps, weight, durationSeconds } : null, requestedLoadChange: requestsLoadChange ? { weight: weightMatch ? weight : null, explicit: Boolean(weightMatch) } : null, requestedAction: ({ end_request: "end_session", pain_or_form: "stop_and_check", equipment_unavailable: "select_alternative", edit_previous: "edit_last_set", exercise_change: "replace_or_reorder", load_change: "adjust_next_load", question: "answer_or_clarify" })[intent] || "confirm_intent" };
}

export function setFeedbackFromText(text = "") {
  const value = String(text).trim();
  const pain = !/(통증|아픔|아프|찝힘|저림)\s*(없|아니)/.test(value) && /(통증|아픔|아프|찝힘|저림)/.test(value);
  const formFailure = !/(폼|자세)\s*(괜찮|좋)/.test(value) && /(폼.*(무너|흐트|안 좋)|자세.*(무너|안 좋|불안))/i.test(value);
  const targetMiss = /(자극.*(안|없|못)|다른 부위.*자극|목표 부위.*(안|없|못))/i.test(value);
  const tooHeavy = /(너무\s*무거|버겁|들기\s*힘|반복.*못)/.test(value);
  const tooEasy = /(너무\s*쉬|여유.*많|가볍)/.test(value);
  const equipmentBusy = /(기구.*(사용\s*중|자리.*없|못\s*씀|고장)|사용\s*중)/.test(value);
  const status = pain ? "pain" : formFailure ? "form_breakdown" : targetMiss ? "target_missed" : tooHeavy ? "too_heavy" : tooEasy ? "too_easy" : "normal";
  return { status, pain, formFailure, targetMiss, equipmentBusy, meaningful: status !== "normal" || equipmentBusy };
}

export function equipmentForExercise(exercise = {}, context = null) {
  const storedItems = context?.equipmentItems || [];
  const items = normalizeLocationEquipment(context || {}).equipmentItems.map((item) => {
    const stored = storedItems.find((candidate) => candidate.id === item.id || candidate.label === item.label) || {};
    const canonical = EQUIPMENT_CATALOG.find((candidate) => candidate.id === item.id);
    return { ...item, ...stored, id: item.id, exerciseIds: canonical?.exerciseIds || stored.exerciseIds || item.exerciseIds || [] };
  });
  for (const stored of storedItems) {
    const canonical = EQUIPMENT_CATALOG.find((item) => item.id === stored.id);
    if (canonical && !items.some((item) => item.id === canonical.id)) items.push({ ...canonical, ...stored, id: canonical.id, exerciseIds: canonical.exerciseIds || [] });
  }
  const compatible = items.filter((item) => (item.exerciseIds || []).includes(exercise.id));
  if (compatible.length) return compatible.sort((a, b) => Number(a.id === "machine") - Number(b.id === "machine") || (a.variants?.length || 0) - (b.variants?.length || 0))[0];
  const required = (exercise.requiredEquipmentIds || []).map((id) => items.find((item) => item.id === id)).filter(Boolean);
  if (required.length) return required[0];
  return items.find((item) => (exercise.equipmentIds || []).includes(item.id)) || null;
}

export function equipmentKeyForExercise(exercise = {}, context = null) {
  const item = equipmentForExercise(exercise, context);
  if (!item) return null;
  const fingerprint = item.variant || item.model || (item.variants || []).slice().sort().join(",") || item.name || "";
  return String(item.instanceId || item.machineKey || [item.id, fingerprint].join("::"));
}

export function loadBasisForExercise(exercise = {}, context = null) {
  if (["assisted_pullup", "assisted_chinup"].includes(exercise.id)) return "assistance";
  const item = equipmentForExercise(exercise, context);
  return exercise.loadBasis || item?.loadBasis || (exercise.equipment === "덤벨" ? "per_hand"
    : ["incline_hammer_press", "low_row", "low_row_wide", "four_way_row", "four_way_row_wide", "high_row"].includes(exercise.id) ? "per_side" : "total");
}

export function recommendedSetInput(exercise, history = [], { phase = "work", warmupIndex = 0, context = null, currentSession = null, locationId = context?.locationId, date = currentSession?.date } = {}) {
  const range = String(exercise?.reps || "8").match(/\d+(?:\.\d+)?/g)?.map(Number) || [8];
  const fallbackReps = Math.max(1, Math.round(range[0] || 8));
  const sessionExercise = currentSession?.exercises?.find((item) => item.id === exercise?.id && item.completedSets?.length);
  const expectedEquipmentKey = equipmentKeyForExercise(exercise, context);
  const expectedLoadBasis = loadBasisForExercise(exercise, context);
  const validSet = (set) => !set.pain && !set.formFailure && set.status !== "pain" && set.status !== "form_breakdown";
  const priorExercise = exerciseRecords(history, exercise?.exerciseId || exercise?.id, { date, locationId })
    .reverse().map(({ exercise: item, session }) => ({ ...item, _session: session }))
    .find((item) => {
      const historicalKey = item.equipmentKey || equipmentKeyForExercise(item, item._session.context);
      // Older assisted-pullup records treated the counterweight as ordinary load.
      // Reuse only records explicitly saved with the new basis at exercise or
      // set level. This preserves valid sets from a migrated in-progress draft
      // whose exercise metadata still carries the old basis.
      const setBasisAssistance = item.completedSets?.length > 0 && item.completedSets.every((set) => set.loadBasis === "assistance");
      const assistanceHistoryMatches = expectedLoadBasis !== "assistance" || item.loadBasis === "assistance" || setBasisAssistance;
      const historicalBasis = setBasisAssistance ? "assistance" : item.loadBasis || loadBasisForExercise(item, item._session.context);
      return item.id === exercise?.id && item.completedSets?.some(validSet)
        && assistanceHistoryMatches
        && (!expectedEquipmentKey || !historicalKey || historicalKey === expectedEquipmentKey)
        && (!expectedLoadBasis || !historicalBasis || historicalBasis === expectedLoadBasis);
    });
  const sessionSet = sessionExercise?.completedSets?.filter(validSet).at(-1);
  const priorSet = sessionSet || priorExercise?.completedSets?.filter(validSet).at(-1);
  const equipmentId = (exercise?.equipmentIds || []).find((id) => EQUIPMENT_CATALOG.some((item) => item.id === id));
  const equipmentSpec = equipmentForExercise(exercise, context) || EQUIPMENT_CATALOG.find((item) => item.id === equipmentId);
  const priorSets = priorExercise?.completedSets || [];
  const initialAssistance = expectedLoadBasis === "assistance" && !priorSet;
  const assistanceStartingPoint = initialAssistance
    ? [...(context?.availableLoads || equipmentSpec?.availableLoads || [])].map(Number).filter((load) => Number.isFinite(load) && load >= 0).sort((a, b) => b - a)[0]
    : null;
  const daysSinceLastWorkout = date && priorExercise?._session?.date ? dateDistance(priorExercise._session.date, date) : null;
  const progression = !sessionSet && priorSet && !(daysSinceLastWorkout >= 14)
    ? nextSessionLoad(priorSets, {
      repLower: range[0] || 0,
      repUpper: range.at(-1) || fallbackReps,
      targetSets: Number(priorExercise.targetSets || priorExercise.sets || exercise?.sets) || 3,
      currentLoad: Number(priorSet.weight),
      loadSteps: context?.loadSteps || equipmentSpec?.loadSteps || [],
      availableLoads: context?.availableLoads || equipmentSpec?.availableLoads,
      equipment: exercise?.equipment,
      exerciseId: exercise?.id,
      loadBasis: loadBasisForExercise(exercise, context),
    })
    : null;
  let currentAdjustment = null;
  if (sessionSet) {
    const lastSet = sessionExercise.completedSets.at(-1);
    currentAdjustment = evaluateSet({
      reps: Number(lastSet?.reps) || 0, repLower: range[0] || 0, repUpper: range.at(-1) || fallbackReps,
      rir: Number.isFinite(Number(lastSet?.rir)) ? Number(lastSet.rir) : 2,
      status: lastSet?.status || "normal", pain: lastSet?.pain, formFailure: lastSet?.formFailure,
    });
  }
  const adjustment = currentAdjustment?.action === "increase_load" || currentAdjustment?.action === "reduce_load"
    ? currentAdjustment.action : progression?.action === "increase_load" || progression?.action === "reduce_load" ? progression.action : null;
  const loadReference = Number(sessionSet?.weight ?? priorSet?.weight);
  const adjustmentLoad = adjustment === "increase_load"
    ? availableNextLoad(loadReference, { availableLoads: context?.availableLoads || equipmentSpec?.availableLoads, loadSteps: context?.loadSteps || equipmentSpec?.loadSteps || [], equipment: exercise?.equipment, exerciseId: exercise?.id, loadBasis: loadBasisForExercise(exercise, context) })
    : adjustment === "reduce_load"
      ? availablePreviousLoad(loadReference, { availableLoads: context?.availableLoads || equipmentSpec?.availableLoads, loadSteps: context?.loadSteps || equipmentSpec?.loadSteps || [], equipment: exercise?.equipment, exerciseId: exercise?.id, loadBasis: loadBasisForExercise(exercise, context) })
      : null;
  const nextLoad = adjustmentLoad ?? (progression?.action === "increase_load" || progression?.action === "reduce_load" ? progression.nextLoad : null);
  const workingWeight = Math.max(0, nextLoad ?? (Number(priorSet?.weight) || (assistanceStartingPoint ?? 0)));
  const workingReps = Math.max(1, Number(adjustment === "increase_load" || nextLoad != null ? range[0] : priorSet?.reps) || fallbackReps);
  const workingDuration = Math.max(1, Number(priorSet?.durationSeconds) || fallbackReps);
  if (phase === "warmup" && !priorSet && exercise?.measurement === "reps_weight") return { weight: null, reps: warmupIndex > 0 ? Math.min(8, workingReps) : Math.min(12, Math.max(8, workingReps)), source: "target", needsInitialLoad: true };
  if (phase !== "warmup") return { weight: workingWeight, reps: workingReps,
    ...(priorExercise && date ? { historyDate: priorExercise._session.date, daysSinceLastWorkout } : {}),
    ...(daysSinceLastWorkout >= 14 ? { reason: "이 종목의 기록이 2주 이상 지나 자동 증량을 보류했습니다. 준비 세트에서 중량을 확인하세요." } : {}),
    ...(["hold_seconds", "unilateral_hold_seconds", "timed_activity", "distance_time"].includes(exercise?.measurement) ? { durationSeconds: workingDuration } : {}),
    source: sessionSet ? (nextLoad != null ? "session_adjustment" : "session") : nextLoad != null ? "history_progression" : priorSet ? "history" : assistanceStartingPoint != null ? "equipment_starting_point" : "target",
    ...((initialAssistance && assistanceStartingPoint == null) || (expectedLoadBasis !== "assistance" && exercise?.measurement === "reps_weight" && !priorSet) ? { needsInitialLoad: true } : {}),
    ...(adjustment ? { loadAdjustment: adjustment } : {}) };
  const ratio = warmupIndex > 0 ? 0.75 : 0.5;
  const assistance = loadBasisForExercise(exercise, context) === "assistance";
  const availableLoads = context?.availableLoads || equipmentSpec?.availableLoads;
  const loadSteps = context?.loadSteps || equipmentSpec?.loadSteps || [];
  const barFloor = exercise?.id === "bench" || exercise?.id === "squat" ? 20 : 0;
  const warmupWorkingWeight = assistance && priorSet ? workingWeight : workingWeight || barFloor;
  const feasibleWarmupTarget = warmupWorkingWeight * ratio;
  let warmupWeight = assistance ? warmupWorkingWeight : feasibleWarmupTarget;
  if (Array.isArray(availableLoads) && availableLoads.length) {
    const loads = availableLoads.map(Number).filter((load) => Number.isFinite(load) && load >= barFloor).sort((a, b) => a - b);
    if (assistance) {
      const easier = loads.filter((load) => load > warmupWorkingWeight);
      if (easier.length) {
        const interpolation = warmupWorkingWeight + (easier.at(-1) - warmupWorkingWeight) * (1 - ratio);
        warmupWeight = easier.find((load) => load >= interpolation) ?? easier.at(-1);
      } else warmupWeight = warmupWorkingWeight;
    } else warmupWeight = loads.filter((load) => load <= feasibleWarmupTarget).at(-1) ?? loads[0] ?? barFloor;
  } else if (loadSteps.length) {
    const step = Math.min(...loadSteps.map(Number).filter((load) => Number.isFinite(load) && load > 0))
      * (exercise?.equipment === "바벨" ? 2 : 1);
    if (step > 0) warmupWeight = assistance
      ? warmupWorkingWeight + step * (warmupIndex > 0 ? 1 : 2)
      : Math.max(barFloor, Math.floor(feasibleWarmupTarget / step) * step);
  }
  return {
    weight: assistance && priorSet ? warmupWeight : warmupWorkingWeight ? warmupWeight : 0,
    reps: warmupIndex > 0 ? Math.min(8, workingReps) : Math.min(12, Math.max(8, workingReps)),
    source: priorSet ? "history_warmup" : "target",
    ...(!priorSet && !barFloor && exercise?.measurement === "reps_weight" ? { needsInitialLoad: true } : {}),
  };
}

export function exerciseWarmupTarget(exercise, previousExercises = []) {
  if (!exercise || exercise.warmupSkipped) return 0;
  if (exercise.kind === "core" || exercise.pattern === "calf_raise") return 0;
  return warmupDecision(exercise, previousExercises).mode === "check"
    ? 1
    : Math.max(0, Number(exercise.warmupSets) || 0);
}

// Older sessions keep their original warmup sets. New sessions only mark the
// preparation complete; warmup loads are always derived from working sets.
export function completedWarmupCount(exercise, previousExercises = []) {
  const target = exerciseWarmupTarget(exercise, previousExercises);
  return exercise?.warmupCompleted ? target : Math.min(target, exercise?.completedWarmups?.length || 0);
}

export function completeExerciseWarmup(session, index) {
  return { ...session, exercises: session.exercises.map((exercise, at) => at === index
    ? { ...exercise, warmupCompleted: true, startConfirmed: true } : exercise) };
}

export function workoutProgress(session) {
  const exercises = session?.exercises || [];
  const bodyTotal = session?.generalWarmup ? 1 : 0;
  const bodyCompleted = session?.generalWarmup?.completed ? bodyTotal : 0;
  return exercises.reduce((progress, exercise, index) => {
    const warmupTotal = exerciseWarmupTarget(exercise, exercises.slice(0, index));
    const warmupCompleted = completedWarmupCount(exercise, exercises.slice(0, index));
    const workTotal = Math.max(0, Number(exercise.sets) || 0);
    const workCompleted = Math.min(workTotal, exercise.completedSets?.length || 0);
    return {
      total: progress.total + warmupTotal + workTotal,
      completed: progress.completed + warmupCompleted + workCompleted,
    };
  }, { total: bodyTotal, completed: bodyCompleted });
}

export function workoutFlowGroups(session) {
  const groups = [];
  for (const [index, exercise] of (session?.exercises || []).entries()) {
    const label = exercise.target || "기타";
    let group = groups.at(-1);
    if (!group || group.label !== label) {
      group = { label, exercises: [] };
      groups.push(group);
    }
    group.exercises.push({ ...exercise, index });
  }
  return groups;
}

export function warmupDecision(exercise, previousExercises = []) {
  if (!exercise) return { mode: "none", reason: "종목이 선택되지 않았습니다." };
  const primed = previousExercises.some((item) => [...(item.muscles || [])].some((muscle) => (exercise.warmupMuscles || exercise.muscles || []).includes(muscle))
    && [...(item.joints || [])].some((joint) => (exercise.warmupJoints || exercise.joints || []).includes(joint))
    && (item.completedSets?.length || 0) > 0);
  if (primed) return { mode: "check", reason: "앞선 운동에서 같은 근육과 관절을 사용했습니다. 가벼운 확인 세트만 하고 본세트로 넘어가세요." };
  if ((exercise.completedWarmups || []).length) return { mode: "specific", reason: "진행 중인 준비운동을 이어갑니다." };
  return { mode: "specific", reason: "가벼운 종목별 준비 세트로 중량과 동작 범위를 확인하세요." };
}

export function sessionLoadMetrics(session) {
  const muscles = {};
  const joints = {};
  const declines = [];
  for (const exercise of recordedExercises(session)) {
    const sets = exercise.completedSets || [];
    for (const muscle of exercise.muscles || []) muscles[muscle] ||= { directSets: 0, indirectSets: 0 };
    for (const joint of exercise.joints || []) joints[joint] ||= { fatigue: 0 };
    sets.forEach((set, index) => {
      for (const muscle of exercise.muscles || []) muscles[muscle].directSets += 1;
      for (const muscle of exercise.indirectMuscles || []) { muscles[muscle] ||= { directSets: 0, indirectSets: 0 }; muscles[muscle].indirectSets += 1; }
      for (const joint of exercise.joints || []) joints[joint].fatigue += set.pain ? 2 : set.formFailure ? 1.5 : 1;
      if (index > 0 && Number(sets[index - 1].reps) > 0 && Number(set.reps) < Number(sets[index - 1].reps)) declines.push({ exerciseId: exercise.id, afterSet: index, percent: Math.round((1 - Number(set.reps) / Number(sets[index - 1].reps)) * 100) });
    });
  }
  return { muscles, joints, performanceDeclines: declines };
}

export function shouldEndExercise(exercise, session, { remainingMinutes = 99, fatigue = 0 } = {}) {
  const completed = exercise?.completedSets?.length || 0;
  const minimum = exercise?.minimumSets || 1;
  const maximum = exercise?.maximumSets || exercise?.sets || 3;
  const volume = Object.values(sessionLoadMetrics(session).muscles).reduce((sum, item) => sum + item.directSets + item.indirectSets * 0.5, 0);
  const declined = sessionLoadMetrics({ exercises: [exercise] }).performanceDeclines.filter((item) => item.percent >= 25).length;
  if (completed < minimum) return { end: false, reason: "필수 최소 세트까지 진행합니다." };
  if (remainingMinutes <= 8 || fatigue >= 4 || declined >= 2) return { end: true, reason: "남은 시간, 피로 또는 반복 성능 하락을 고려해 종료합니다." };
  if (completed >= maximum) return { end: true, reason: `현재 종목 상한과 세션 누적 볼륨(${volume.toFixed(1)} 유효 세트)에 도달했습니다.` };
  return { end: false, reason: "세션 볼륨과 상태가 허용하는 범위에서 추가 세트를 선택할 수 있습니다." };
}

export { estimateMealNutrition, mergeMealNutrition } from "./nutrition.js";

export function evaluateSet({ redFlag = false, sharpPain = false, jointPinch = false, formFailure = false,
  targetMiss = false, status = "normal", rir = 2, equipmentBusy = false, remainingMinutes = 99, fatigue = 0,
  completedSets = 0, targetSets = 3, reps = 0, repLower = 0, repUpper = 12, pain = false } = {}) {
  if (redFlag) return { action: "end_session", reason: "전신 이상 신호가 있어 오늘 운동을 종료하고 상태를 확인합니다.", priority: 0 };
  if (sharpPain || jointPinch || pain || status === "pain") return { action: "replace_exercise", reason: "날카로운 통증이나 관절 찝힘이 있어 해당 종목을 중단합니다.", priority: 1 };
  if (formFailure || status === "form_breakdown") return { action: "retest_form", reason: "폼이 무너져 중량이나 난도를 낮춰 자세를 다시 확인합니다.", priority: 2 };
  if (targetMiss || status === "target_missed") return { action: "change_tempo", reason: "목표 부위 자극이 부족해 템포와 가동 범위를 먼저 조정합니다.", priority: 3 };
  if (status === "too_heavy" || (reps > 0 && repLower > 0 && reps < repLower)) return { action: "reduce_load", reason: "목표 반복 범위에 들지 못해 다음 세트 중량을 낮춥니다.", priority: 4 };
  if (status === "too_easy" || (reps > repUpper && repUpper > 0) || rir >= 5) return { action: "increase_load", reason: "목표 범위보다 반복이 많거나 여유가 커서 다음 세트에서 소폭 증량합니다.", priority: 4 };
  if (equipmentBusy) return { action: "other_pattern", reason: "기구를 기다리는 동안 미완료 다른 패턴을 먼저 진행합니다.", priority: 5 };
  if (remainingMinutes <= 8 || fatigue >= 4) return { action: "end_exercise", reason: "남은 시간과 피로를 고려해 이 종목을 마무리합니다.", priority: 6 };
  return { action: "maintain", reason: "목표 범위와 안정적인 폼을 유지하며 다음 세트를 진행합니다.", priority: 7 };
}

export function availableNextLoad(currentLoad, { availableLoads = [], loads = availableLoads, loadSteps = [], equipment = "", exerciseId = "", loadBasis = "" } = {}) {
  const current = Number(currentLoad);
  if (!Number.isFinite(current) || current < 0) return null;
  const assistance = loadBasis === "assistance";
  const explicit = [...new Set((loads || []).map(Number).filter((load) => Number.isFinite(load) && (assistance ? load < current : load > current)))].sort((a, b) => assistance ? b - a : a - b);
  if (explicit.length) return explicit[0];
  if ((availableLoads || []).length || (loads || []).length) return null;
  const multiplier = equipment === "바벨" || ["bench", "squat", "ohp", "barbell_row"].includes(exerciseId) ? 2 : 1;
  const steps = (loadSteps || []).map(Number).filter((step) => Number.isFinite(step) && step > 0).map((step) => step * multiplier).sort((a, b) => a - b);
  return steps.length ? assistance ? Math.max(0, current - steps[0]) : current + steps[0] : null;
}

export function availablePreviousLoad(currentLoad, { availableLoads = [], loads = availableLoads, loadSteps = [], equipment = "", exerciseId = "", loadBasis = "" } = {}) {
  const current = Number(currentLoad);
  if (!Number.isFinite(current) || current < 0) return null;
  const floor = equipment === "바벨" || ["bench", "squat"].includes(exerciseId) ? 20 : 0;
  const assistance = loadBasis === "assistance";
  const explicit = [...new Set((loads || []).map(Number).filter((load) => Number.isFinite(load) && (assistance ? load > current : load < current && load >= floor)))].sort((a, b) => assistance ? a - b : b - a);
  if (explicit.length) return explicit[0];
  if ((availableLoads || []).length || (loads || []).length) return null;
  const multiplier = equipment === "바벨" || ["bench", "squat", "ohp", "barbell_row"].includes(exerciseId) ? 2 : 1;
  const steps = (loadSteps || []).map(Number).filter((step) => Number.isFinite(step) && step > 0).map((step) => step * multiplier).sort((a, b) => a - b);
  return steps.length ? assistance ? current + steps[0] : Math.max(floor, current - steps[0]) : null;
}

export function nextSessionLoad(progress, { repLower = 0, repUpper = 12, targetSets = 3, currentLoad, availableLoads, loads, loadSteps, equipment, exerciseId, loadBasis } = {}) {
  const sets = Array.isArray(progress) ? progress : [];
  const actualSets = sets.slice(0, targetSets);
  const sameLoad = actualSets.length > 0 && actualSets.every((set) => set.weight == null
    ? actualSets[0].weight == null
    : Number.isFinite(Number(set.weight)) && Number.isFinite(Number(actualSets[0].weight)) && Number(set.weight) === Number(actualSets[0].weight));
  const cleanComplete = sets.length >= targetSets && sameLoad && actualSets.every((set) =>
    !set.pain && !set.formFailure && set.status !== "pain" && set.status !== "form_breakdown");
  const progressed = cleanComplete && actualSets.every((set) => Number(set.reps) >= repUpper && Number(set.rir) >= 1);
  const regressed = cleanComplete && repLower > 0 && actualSets.some((set) => Number(set.reps) > 0 && Number(set.reps) < repLower);
  const nextLoad = progressed && currentLoad != null ? availableNextLoad(currentLoad, { availableLoads, loads, loadSteps, equipment, exerciseId, loadBasis }) : null;
  const reducedLoad = regressed && currentLoad != null ? availablePreviousLoad(currentLoad, { availableLoads, loads, loadSteps, equipment, exerciseId, loadBasis }) : null;
  return progressed ? { action: "increase_load", ...(nextLoad == null ? {} : { nextLoad }), reason: "전체 목표 세트를 같은 중량으로 상한 반복까지 좋은 폼과 무통증으로 완료했습니다." }
    : regressed ? { action: "reduce_load", ...(reducedLoad == null ? {} : { nextLoad: reducedLoad }), reason: "목표 반복 하한에 들지 못한 세트가 있어 다음 회차 중량을 낮춥니다." }
    : { action: "maintain", reason: "다음 회차도 현재 중량으로 반복 범위를 채웁니다." };
}

export function cardioRecommendation(type, { fatigue = 0, remainingMinutes = 30 } = {}) {
  const base = type === "PUSH" ? { mode: "interval", label: "빠른 러닝머신 250m × 4" }
    : type === "PULL" ? { mode: "easy", label: "이지런 20~30분" }
      : type === "LEGS" || String(type).startsWith("하체") ? { mode: "none", label: "러닝 없음" }
        : { mode: "easy", label: "가벼운 유산소 선택" };
  if (base.mode === "none") return base;
  if (fatigue >= 4 || remainingMinutes < 10) return { ...base, mode: "none", label: "피로와 남은 시간을 고려해 생략" };
  if (fatigue >= 3 || remainingMinutes < 20) return { ...base, mode: "reduced", label: type === "PUSH" ? "빠른 250m × 2" : "이지런 10~15분" };
  return base;
}

export const INITIAL_INTAKE = {
  goal: "",
  experience: "초급",
  avoid: "",
  preferences: "등 운동을 할 때마다 다른 종목을 하고 싶어요.",
  preferMachinesWhenEquivalent: true,
};

function intakeText(intake = {}) {
  const clarificationText = Array.isArray(intake.clarifications)
    ? intake.clarifications.map((item) => `${item.question || ""} ${item.answer || ""}`).join(" ")
    : "";
  return [intake.goal, intake.preferences, clarificationText].filter(Boolean).join(" ").toLowerCase();
}

export function requestedSplit(intake = {}) {
  const text = intakeText(intake);
  const orderedPpl = /(가슴|삼두|어깨|push|푸시)[\s\S]*(등|이두|pull|풀)[\s\S]*(하체|복근|legs?|레그)/i.test(text);
  if (/\bp\s*\/?\s*p\s*\/?\s*l\b/i.test(text) || orderedPpl) return "ppl";
  if (/(상체[\s\S]*하체|upper[\s_-]*lower)/i.test(text)) return "upper_lower";
  if (/(전신[\s\S]*(루틴|운동)|full[\s_-]*body)/i.test(text)) return "full_body";
  return null;
}

function normalizedPhrase(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9가-힣]+/g, "");
}

function mentionedExerciseIds(value = "") {
  const text = normalizedPhrase(value);
  if (!text) return [];
  const directlyMatched = EXERCISES.filter((exercise) => {
    const name = normalizedPhrase(exercise.name);
    const id = normalizedPhrase(exercise.id);
    return (name.length >= 3 && text.includes(name)) || (id.length >= 4 && text.includes(id))
      || (exercise.aliases || []).some((alias) => normalizedPhrase(alias).length >= 3 && text.includes(normalizedPhrase(alias)));
  });
  const matched = directlyMatched.filter((exercise) => {
    const name = normalizedPhrase(exercise.name);
    return !directlyMatched.some((other) => other.id !== exercise.id && (
      other.baseExerciseId === exercise.id
      || (normalizedPhrase(other.name).length > name.length && normalizedPhrase(other.name).includes(name))
    ));
  }).map((exercise) => exercise.id);
  const explicitVariantBases = new Set(directlyMatched.map((exercise) => exercise.baseExerciseId).filter(Boolean));
  const explicitCurlVariants = directlyMatched.some((exercise) => ["prone_leg_curl", "seated_leg_curl"].includes(exercise.id));
  const aliasMatched = EQUIPMENT_CATALOG.filter((item) => item.exerciseIds?.length)
    .filter((item) => [item.label, ...(item.aliases || [])].some((alias) => {
      const normalizedAlias = normalizedPhrase(alias);
      return normalizedAlias.length >= 3 && text.includes(normalizedAlias);
    }))
    .flatMap((item) => item.exerciseIds.filter((id) => {
      const candidate = EXERCISES.find((exercise) => exercise.id === id);
      return !(id === "leg_curl" && explicitCurlVariants)
        && !candidate?.baseExerciseId && !explicitVariantBases.has(id) && !explicitVariantBases.has(candidate?.baseExerciseId);
    }));
  return [...new Set([...matched, ...aliasMatched])];
}

function preferredExerciseIds(intake = {}) {
  return [...new Set(String(intake.preferences || "").split(/[\n.!?]+/).flatMap((rawLine) => {
    let line = rawLine;
    const contrasts = [...line.matchAll(/하기보다|보다는|말고|대신|하지만|보다/g)];
    if (contrasts.length) {
      const last = contrasts.at(-1);
      line = line.slice(last.index + last[0].length);
    }
    return line.split(/[,;/]+/).flatMap((clause) => {
      if (/(제외|피하|금지|싫|사용하지|하지\s*않|안\s*하)/.test(clause)) return [];
      return mentionedExerciseIds(clause);
    });
  }))];
}

function avoidedExerciseIds(intake = {}) {
  const equipmentTerms = ["바벨", "덤벨", "케이블", "철봉", "머신", "맨몸"];
  const lines = String(intake.avoid || "").split(/[\n.!?]+/);
  const excluded = [];
  for (const line of lines) {
    if (!/(피하|제외|금지|싫|사용하지|하지\s*않|안\s*하)/.test(line)) continue;
    excluded.push(...mentionedExerciseIds(line));
    for (const equipment of equipmentTerms) {
      const explicitEquipmentExclusion = new RegExp(`${equipment}\\s*(?:운동|종목|기구|사용)?\\s*(?:은|는|을|를)?\\s*(?:전부|모두)?\\s*(?:피하|제외|금지|싫|사용하지|하지\\s*않|안\\s*하)`);
      if (explicitEquipmentExclusion.test(line)) excluded.push(...EXERCISES.filter((exercise) => exercise.equipment === equipment).map((exercise) => exercise.id));
    }
  }
  return [...new Set(excluded)];
}

const PREFERENCE_RULES_VERSION = 4;
const ROUTINE_RULES_VERSION = 4;
const DEFAULT_PATTERN_SESSIONS = {
  horizontal_press: "PUSH", incline_press: "PUSH", vertical_press: "PUSH", chest_fly: "PUSH", lateral_raise: "PUSH", rear_delt: "PUSH", elbow_extension: "PUSH",
  vertical_pull: "PULL", horizontal_pull: "PULL", upper_back: "PULL", lat_isolation: "PULL", elbow_flexion: "PULL", brachioradialis: "PULL", wrist_extensors: "PULL", wrist_flexion: "PULL",
  squat: "LEGS", knee_flexion: "LEGS", hip_hinge: "LEGS", single_leg: "LEGS", hip_abduction: "LEGS", glute_extension: "LEGS", calf_raise: "LEGS", core_stability: "LEGS", core_flexion: "LEGS", core_lower: "LEGS", core_lateral: "LEGS",
};

export function cycleLabel(plan) {
  const split = SPLITS[plan?.split] || SPLITS.hybrid;
  return plan?.restAfterCycle
    ? `${split.label} · ${split.sessions.length}회 운동 + 1회 휴식 순환`
    : `${split.label} · ${split.sessions.length}회 순환`;
}

export function normalizeIntake(raw = {}) {
  return {
    goal: String(raw.goal || ""),
    experience: String(raw.experience || INITIAL_INTAKE.experience),
    avoid: String(raw.avoid || ""),
    preferences: String(raw.preferences ?? INITIAL_INTAKE.preferences),
    preferMachinesWhenEquivalent: raw.preferMachinesWhenEquivalent ?? INITIAL_INTAKE.preferMachinesWhenEquivalent,
  };
}

export function localPlan(intake) {
  const split = requestedSplit(intake) || "hybrid";
  const restAfterCycle = split === "ppl" || /(휴식|rest)/i.test(intakeText(intake));
  const profileText = intakeText(intake);
  const excludedExerciseIds = avoidedExerciseIds(intake);
  const preferredIds = preferredExerciseIds(intake);
  return {
    split,
    restAfterCycle,
    goalSummary: intake.goal.trim(),
    focus: "전신 균형",
    rationale: "요일에 관계없이 운동 순서를 반복하며, 운동하는 날마다 시간과 장소를 고르고 종목을 바꿀 수 있습니다." + (excludedExerciseIds.length ? " 피하고 싶은 종목과 기구는 기본 추천에서 제외합니다." : ""),
    backVariety: true,
    varyExercises: true,
    pullForearms: /(등[\s\S]{0,30}(?:이두[\s\S]{0,15})?전완|pull[\s\S]{0,30}전완)/i.test(profileText),
    pushRearDeltRequired: /(후면\s*(?:어깨|삼각근)[\s\S]{0,30}항상\s*포함|후면\s*(?:어깨|삼각근)[\s\S]{0,30}우선)/i.test(profileText),
    pushLateralDeltPriority: /(측면\s*(?:어깨|삼각근)[\s\S]{0,40}(?:높은\s*우선|우선순위|우선))/i.test(profileText),
    preferMachinesWhenEquivalent: intake.preferMachinesWhenEquivalent !== false,
    preferredExerciseIds: preferredIds,
    excludedExerciseIds,
    patternSessions: inferPatternSessions(intake),
    experience: intake.experience,
    changeSummary: "초기 운동 원칙",
  };
}

export function normalizePlan(raw, intake, { trustRawRules = false } = {}) {
  const base = localPlan(intake);
  const split = requestedSplit(intake) || (Object.hasOwn(SPLITS, raw?.split) ? raw.split : base.split);
  const preserveRawRules = trustRawRules || raw?.preferenceRulesVersion === PREFERENCE_RULES_VERSION;
  const matchingRules = currentTrainingRules(intake, raw?.trainingRules);
  const normalizedRules = matchingRules ? normalizeTrainingRules(matchingRules, intake, EXERCISES) : null;
  // Old exact-source rules had no assignment field. Keep assignments stated in
  // the profile active when migrating those rules to the current schema.
  const structuredRules = normalizedRules ? { ...normalizedRules, patternSessions: { ...base.patternSessions, ...normalizedRules.patternSessions } } : null;
  const effectiveSplit = structuredRules?.split || split;
  const excludedExerciseIds = [...new Set(structuredRules ? structuredRules.excludedExerciseIds : [
    ...(preserveRawRules && Array.isArray(raw?.excludedExerciseIds) ? raw.excludedExerciseIds : []),
    ...base.excludedExerciseIds,
  ])].filter((id) => EXERCISES.some((item) => item.id === id));
  const preferredExerciseIds = [...new Set(structuredRules ? structuredRules.preferredExerciseIds : [
    ...(preserveRawRules && Array.isArray(raw?.preferredExerciseIds) ? raw.preferredExerciseIds : []),
    ...base.preferredExerciseIds,
  ])].filter((id) => EXERCISES.some((item) => item.id === id) && !excludedExerciseIds.includes(id));
  const pullForearms = intake ? base.pullForearms : raw?.pullForearms === true;
  const pushRearDeltRequired = intake ? base.pushRearDeltRequired : raw?.pushRearDeltRequired === true;
  const pushLateralDeltPriority = intake ? base.pushLateralDeltPriority : raw?.pushLateralDeltPriority === true;
  const effectivePullForearms = structuredRules?.pullForearms ?? pullForearms;
  return {
    preferenceRulesVersion: PREFERENCE_RULES_VERSION,
    routineRulesVersion: ROUTINE_RULES_VERSION,
    version: Math.max(1, Number(raw?.version) || 1),
    split: effectiveSplit,
    restAfterCycle: structuredRules?.restAfterCycle ?? (split === "ppl" || raw?.restAfterCycle === true || base.restAfterCycle),
    sessionContracts: effectiveSplit === "ppl" ? ["PUSH", "PULL", "LEGS", "REST"].map((type) => type === "REST" ? { label: type, requiredGroups: [], allowedKinds: [], restAfter: true } : sessionContract(type, { pullForearms: effectivePullForearms, patternSessions: structuredRules?.patternSessions || base.patternSessions })) : [],
    goalSummary: String(raw?.goalSummary || base.goalSummary).slice(0, 300),
    focus: String(raw?.focus || base.focus).slice(0, 100),
    rationale: String(raw?.rationale || base.rationale).slice(0, 600),
    backVariety: structuredRules?.backVariety ?? raw?.backVariety !== false,
    varyExercises: structuredRules?.varyExercises ?? raw?.varyExercises ?? raw?.backVariety !== false,
    pullForearms: effectivePullForearms,
    pushRearDeltRequired,
    pushLateralDeltPriority,
    preferMachinesWhenEquivalent: structuredRules?.preferMachinesWhenEquivalent ?? intake?.preferMachinesWhenEquivalent ?? raw?.preferMachinesWhenEquivalent ?? base.preferMachinesWhenEquivalent,
    preferredExerciseIds,
    excludedExerciseIds,
    patternSessions: structuredRules?.patternSessions || base.patternSessions,
    ...(structuredRules ? { trainingRules: structuredRules, fixedExerciseIds: structuredRules.fixedExerciseIds, priorities: structuredRules.priorities, sessionOrders: structuredRules.sessionOrders } : {}),
    experience: String(intake?.experience || raw?.experience || base.experience),
    changeSummary: String(raw?.changeSummary || base.changeSummary).slice(0, 250),
  };
}

export function workoutType(plan, sessionIndex, history = [], date = null) {
  if (date) return sessionTypeForDate(plan, history, date, sessionIndex);
  const sessions = SPLITS[plan.split]?.sessions ?? SPLITS.full_body.sessions;
  const lastType = latestCompletedSession(history, date)?.label;
  const lastIndex = sessions.indexOf(lastType);
  if (lastIndex >= 0) return sessions[(lastIndex + 1) % sessions.length];
  return sessions[sessionIndex % sessions.length];
}

function latestCompletedSession(history = [], throughDate = null) {
  return [...history].filter((item) => item?.status === "complete" && item.date && (!throughDate || item.date <= throughDate))
    .sort((a, b) => String(a.date).localeCompare(String(b.date))).at(-1) || null;
}

export function sessionTypeForDate(plan, history = [], date = localDateKey(), sessionIndex = null) {
  history = historyThroughDate(history, date);
  sessionIndex ??= history.filter((item) => item.status === "complete").length;
  const sessions = SPLITS[plan?.split]?.sessions || [];
  const lastWorkout = latestCompletedSession(history, date);
  if (!lastWorkout) return sessions[sessionIndex % Math.max(1, sessions.length)] || "전신";
  const days = dateDistance(lastWorkout.date, date);
  if (plan?.restAfterCycle && lastWorkout.label === sessions.at(-1) && days === 1) return "REST";
  const nextIndex = sessions.indexOf(lastWorkout.label);
  return nextIndex >= 0 ? sessions[(nextIndex + 1) % sessions.length] : sessions[sessionIndex % Math.max(1, sessions.length)] || "전신";
}

export function restRecommended(plan, history = [], date = localDateKey()) {
  return sessionTypeForDate(plan, history, date) === "REST";
}

export function availableExercises(context, plan) {
  const normalizedLocation = normalizeLocationEquipment(context || {});
  const equipmentIds = new Set(normalizedLocation.equipmentItems.map((item) => item.id));
  const allowedExerciseIds = new Set(normalizedLocation.equipmentItems.flatMap((item) => item.exerciseIds || []));
  const excluded = new Set(plan.excludedExerciseIds || []);
  return EXERCISES.map((item) => ({ measurement: item.measurement || (item.equipment === "맨몸" ? "bodyweight_reps" : "reps_weight"), equipmentIds: item.equipmentIds || (item.equipment === "케이블" ? ["cable"] : item.equipment === "바벨" ? ["barbell"] : item.equipment === "덤벨" ? ["dumbbell"] : []), ...item }))
    .filter((item) => allowedExerciseIds.has(item.id)
      && (item.requiredEquipmentIds || []).every((id) => equipmentIds.has(id))
      && !excluded.has(item.id));
}

function pick(exercises, kind, count, shift = 0) {
  const choices = exercises.filter((exercise) => exercise.kind === kind);
  if (!choices.length) return [];
  return Array.from({ length: Math.min(count, choices.length) }, (_, index) => choices[(shift + index) % choices.length]);
}

const EQUIPMENT_PRIORITY = { "머신": 0, "케이블": 1, "덤벨": 2, "바벨": 2, "철봉": 3, "맨몸": 4 };

function preferredExerciseOrder(exercises, plan, history = []) {
  const preferred = new Set(plan.preferredExerciseIds || []);
  const historyCount = new Map();
  for (const session of history) {
    for (const exercise of session.exercises || []) {
      if ((exercise.completedSets || []).length || session.status === "complete") {
        historyCount.set(exercise.id, (historyCount.get(exercise.id) || 0) + 1);
      }
    }
  }
  return exercises.map((exercise, index) => ({ exercise, index }))
    .sort((a, b) => Number(preferred.has(b.exercise.id)) - Number(preferred.has(a.exercise.id))
      || (plan.preferMachinesWhenEquivalent ? (EQUIPMENT_PRIORITY[a.exercise.equipment] ?? 3) - (EQUIPMENT_PRIORITY[b.exercise.equipment] ?? 3) : 0)
      || (historyCount.get(b.exercise.id) || 0) - (historyCount.get(a.exercise.id) || 0)
      || a.index - b.index)
    .map(({ exercise }) => exercise);
}

const ACCESSORY_PATTERNS = new Set(["chest_fly", "lateral_raise", "rear_delt", "elbow_extension", "lat_isolation", "elbow_flexion", "brachioradialis", "wrist_extensors", "wrist_flexion", "knee_flexion", "hip_abduction", "glute_extension", "calf_raise", "core_stability", "core_flexion", "core_lower", "core_lateral"]);

export function volumeAdjustedSets(exercise, previousExercises = []) {
  const baseSets = Math.max(1, Number(exercise?.sets) || 3);
  const roles = exerciseMuscleRoles(exercise);
  const loads = new Map();
  for (const previous of previousExercises) {
    const priorRoles = exerciseMuscleRoles(previous);
    const sets = Math.max(0, Number(previous.sets) || 0);
    for (const muscle of priorRoles.primary) loads.set(muscle, (loads.get(muscle) || 0) + sets);
    for (const muscle of priorRoles.secondary) loads.set(muscle, (loads.get(muscle) || 0) + sets * 0.5);
  }
  const exposure = Math.max(0, ...roles.primary.map((muscle) => loads.get(muscle) || 0));
  const threshold = ACCESSORY_PATTERNS.has(exercise.pattern) ? 3 : 6;
  const adjusted = exposure >= threshold ? Math.max(2, baseSets - 1) : baseSets;
  return {
    sets: adjusted,
    exposure: Math.round(exposure * 10) / 10,
    adjusted: adjusted < baseSets,
    reason: adjusted < baseSets ? `앞선 종목의 주·보조근 누적 ${Math.round(exposure * 10) / 10}세트를 반영해 ${adjusted}세트로 조절` : "",
  };
}

export function estimatedSessionSeconds(session) {
  const warmupSeconds = session?.generalWarmup?.completed ? 0 : (session?.generalWarmup?.exercises?.length || 0) * 35;
  const exerciseSeconds = (session?.exercises || []).reduce((total, exercise) => {
    if (exercise.skipped) return total;
    const warmups = Math.max(0, exerciseWarmupTarget(exercise, []) - completedWarmupCount(exercise)) * 95;
    const workSets = Math.max(0, (Number(exercise.sets) || 0) - (exercise.completedSets?.length || 0));
    const timed = ["hold_seconds", "unilateral_hold_seconds"].includes(exercise.measurement);
    const targetSeconds = timed ? Math.max(...(exercise.reps.match(/\d+/g) || [30]).map(Number)) * (exercise.measurement === "unilateral_hold_seconds" ? 2 : 1) : 45;
    const restSeconds = Math.max(0, Number(exercise.restSeconds ?? 120));
    return total + warmups + workSets * (targetSeconds + restSeconds) + (workSets || warmups ? 30 : 0);
  }, 0);
  return warmupSeconds + Math.max(0, exerciseSeconds - (exerciseSeconds ? 120 : 0));
}

export function withSessionTimeBudget(session) {
  if (!session?.context?.durationMinutes) return session;
  const estimatedSeconds = estimatedSessionSeconds(session);
  const remainingSeconds = Math.max(0, Number(session.context.durationMinutes) * 60 - sessionElapsedSeconds(session));
  return { ...session, estimatedSeconds, remainingSeconds, timeOverrun: estimatedSeconds > remainingSeconds };
}

export function adaptRemainingVolume(session, history = [], date = session?.date || localDateKey(), { fatigue = session?.context?.readiness?.fatigue ?? session?.fatigueScore ?? session?.fatigue ?? 0 } = {}) {
  if (!session?.exercises?.length) return session;
  const recentSessions = historyThroughDate(history, date)
    .filter((item) => item?.status === "complete" && item.date && dateDistance(item.date, date) >= 0 && dateDistance(item.date, date) <= 6)
  const recentVolumeByMuscle = {};
  const recentEffectiveSets = recentSessions.reduce((total, item) => total + recordedExercises(item).reduce((exerciseTotal, exercise) => {
    const completed = Math.max(0, exercise.completedSets?.length || 0);
    const roles = exerciseMuscleRoles(exercise);
    for (const muscle of roles.primary) recentVolumeByMuscle[muscle] = (recentVolumeByMuscle[muscle] || 0) + completed;
    for (const muscle of roles.secondary) recentVolumeByMuscle[muscle] = (recentVolumeByMuscle[muscle] || 0) + completed * 0.5;
    return exerciseTotal + completed * (roles.primary.length ? 1 : 0) + completed * (roles.secondary.length ? 0.5 : 0);
  }, 0), 0);
  const prior = recentSessions
    .flatMap((item) => recordedExercises(item).map((exercise) => ({
      ...exercise,
      sets: Math.max(0, exercise.completedSets?.length || 0),
      completedSets: undefined,
    })));
  let preceding = [];
  let recentVolumeFatigueApplied = false;
  const exercises = session.exercises.map((exercise) => {
    const started = Boolean(exercise.startConfirmed || exercise.activeStartedAt || exercise.warmupCompleted || exercise.completedWarmups?.length || exercise.warmupSkipped || exercise.completedSets?.length);
    if (started) {
      const actualSets = Math.max(0, exercise.completedSets?.length || 0);
      if (actualSets) preceding.push({ ...exercise, sets: actualSets, completedSets: undefined });
      return exercise;
    }
    const catalogSets = Number(exercise.baseSets || EXERCISES.find((item) => item.id === exercise.id)?.sets || exercise.sets) || 3;
    const targetMuscles = exerciseMuscleRoles(exercise).primary;
    const recentExposure = Math.max(0, ...targetMuscles.map((muscle) => recentVolumeByMuscle[muscle] || 0));
    const includeRecentForExercise = recentExposure >= 6 && Number(fatigue) >= 3;
    if (includeRecentForExercise) recentVolumeFatigueApplied = true;
    const adjusted = volumeAdjustedSets({ ...exercise, sets: Math.min(catalogSets, Number(exercise.budgetSets) || catalogSets) }, [...(includeRecentForExercise ? prior : []), ...preceding]);
    const minimum = Math.max(1, Number(exercise.minimumSets) || 1);
    const sets = Math.max(minimum, adjusted.sets);
    const reason = sets < exercise.sets ? adjusted.reason || "최근 실제 세트량과 겹치는 근육 사용을 반영했습니다." : exercise.setAdjustmentReason;
    const next = { ...exercise, sets, targetSets: sets, optionalSets: Math.max(0, sets - minimum), setAdjustmentReason: reason };
    preceding.push({ ...exercise, sets, completedSets: undefined });
    return next;
  });
  const adapted = { ...session, exercises, recentEffectiveSets: Math.round(recentEffectiveSets * 10) / 10, recentVolumeByMuscle, recentVolumeFatigueApplied };
  const allottedSeconds = Math.max(0, Number(session.context?.durationMinutes) || 0) * 60;
  const elapsedSeconds = sessionElapsedSeconds(session);
  const remainingSeconds = allottedSeconds > 0 ? Math.max(0, allottedSeconds - elapsedSeconds) : 0;
  if (allottedSeconds > 0 && estimatedSessionSeconds(adapted) > remainingSeconds) {
    const timed = adapted.exercises.map((exercise) => ({ ...exercise }));
    for (let index = timed.length - 1; index >= 0 && estimatedSessionSeconds({ ...adapted, exercises: timed }) > remainingSeconds; index -= 1) {
      const exercise = timed[index];
      if (exercise.startConfirmed || exercise.activeStartedAt || exercise.warmupCompleted || exercise.completedWarmups?.length || exercise.warmupSkipped || exercise.completedSets?.length || exercise.priority === "essential" || exercise.priority === "main") continue;
      const minimum = Math.max(1, Number(exercise.minimumSets) || 1);
      while (Number(exercise.sets) > minimum && estimatedSessionSeconds({ ...adapted, exercises: timed }) > remainingSeconds) {
        exercise.sets -= 1;
        exercise.targetSets = exercise.sets;
        exercise.optionalSets = Math.max(0, exercise.sets - minimum);
        exercise.setAdjustmentReason = [...new Set([exercise.setAdjustmentReason, "남은 시간에 맞춰 선택 세트를 줄였습니다."].filter(Boolean))].join(" · ");
      }
    }
    return { ...adapted, exercises: timed, estimatedSeconds: estimatedSessionSeconds({ ...adapted, exercises: timed }), remainingSeconds, timeOverrun: estimatedSessionSeconds({ ...adapted, exercises: timed }) > remainingSeconds };
  }
  return { ...adapted, estimatedSeconds: estimatedSessionSeconds(adapted), remainingSeconds, timeOverrun: allottedSeconds > 0 && estimatedSessionSeconds(adapted) > remainingSeconds };
}

function pickRole(pool, predicate, plan, history, sessionType, selected = [], { rotate = true } = {}) {
  const usedIds = new Set(selected.map((item) => item.id));
  const usedBases = new Set(selected.map((item) => item.baseExerciseId || item.id));
  let candidates = pool.filter((item) => predicate(item) && !usedIds.has(item.id) && !usedBases.has(item.baseExerciseId || item.id));
  if (!candidates.length) return null;
  const preferred = new Set(plan.preferredExerciseIds || []);
  const previous = history.filter((session) => session.label === sessionType && session.exercises?.length).slice(-2).reverse();
  if (sessionType === "PULL" && candidates.some((item) => item.equipment !== "맨몸")) candidates = candidates.filter((item) => item.equipment !== "맨몸");
  const recentUse = (item) => {
    const base = item.baseExerciseId || item.id;
    return previous.filter((session) => session.exercises.some((used) => used.id === item.id || (used.baseExerciseId || used.id) === base)).length;
  };
  if (rotate) {
    const leastRecentUse = Math.min(...candidates.map(recentUse));
    candidates = candidates.filter((item) => recentUse(item) === leastRecentUse);
  }
  const score = (item) => {
    const base = item.baseExerciseId || item.id;
    const priorUse = previous.map((session) => session.exercises.some((used) => used.id === item.id || (used.baseExerciseId || used.id) === base));
    return (preferred.has(item.id) || preferred.has(base) ? 8 : 0)
      + (plan.preferMachinesWhenEquivalent ? ({ "머신": 4, "케이블": 3, "덤벨": 2, "바벨": 2, "철봉": 1, "맨몸": 0 }[item.equipment] ?? 0) : 0)
      + (item.kind === "core" && item.equipment === "맨몸" ? 12 : 0)
      - (rotate && priorUse[0] ? 20 : 0)
      - (rotate && priorUse[1] ? 9 : 0);
  };
  return candidates.map((item, index) => ({ item, index }))
    .sort((a, b) => score(b.item) - score(a.item) || a.index - b.index)[0].item;
}

function choosePplExercises(type, pool, plan, history, durationMinutes) {
  const selected = [];
  const rules = plan.trainingRules;
  const assignments = plan.patternSessions || rules?.patternSessions || {};
  const movedHere = (patternName) => assignments[patternName] === type && DEFAULT_PATTERN_SESSIONS[patternName] !== type;
  const movedAway = (patternName) => assignments[patternName] && assignments[patternName] !== type;
  const chooseForRole = (predicate, rotate = true) => {
    const eligible = pool.filter((item) => predicate(item) && !movedAway(item.pattern));
    const fixed = eligible.find((item) => rules?.fixedExerciseIds?.includes(item.id));
    if (fixed) return fixed;
    const preferred = eligible.filter((item) => plan.preferredExerciseIds?.includes(item.id));
    const candidates = preferred.length ? preferred : eligible;
    return pickRole(candidates, predicate, plan, history, type, selected, { rotate: preferred.length === 1 ? false : rotate && (plan.varyExercises ?? plan.backVariety !== false) });
  };
  const add = (predicate, options) => {
    const item = chooseForRole(predicate, options?.rotate !== false);
    if (item) selected.push(item);
  };
  const pattern = (name) => (item) => item.pattern === name;
  if (type === "PUSH") {
    add(pattern("horizontal_press"), { rotate: false });
    add(pattern("incline_press"), { rotate: false });
    add(pattern("lateral_raise"));
    add(pattern("rear_delt"));
    if (!selected.some((item) => item.target === "어깨")) add(pattern("vertical_press"));
    add(pattern("elbow_extension"));
  } else if (type === "PULL") {
    const preferredVertical = pool.find((item) => !movedAway(item.pattern) && (rules?.preferredExerciseIds?.includes(item.id) || plan.preferredExerciseIds?.includes(item.id)) && item.pattern === "vertical_pull");
    const lat = pool.find((item) => !movedAway(item.pattern) && rules?.fixedExerciseIds?.includes(item.id) && item.pattern === "vertical_pull")
      || preferredVertical || pool.find((item) => !movedAway(item.pattern) && item.id === "lat_pulldown");
    if (lat) selected.push(lat);
    else add(pattern("vertical_pull"));
    add(pattern("horizontal_pull"));
    add(pattern("upper_back"));
    add(pattern("lat_isolation"));
    add(pattern("elbow_flexion"));
    if (plan.pullForearms) add((item) => item.kind === "forearms");
    else add(pattern("elbow_flexion"));
  } else if (type === "LEGS") {
    const squat = pool.find((item) => !movedAway(item.pattern) && rules?.fixedExerciseIds?.includes(item.id) && item.pattern === "squat")
      || pool.find((item) => !movedAway(item.pattern) && rules?.preferredExerciseIds?.includes(item.id) && item.pattern === "squat")
      || pool.find((item) => !movedAway(item.pattern) && item.id === "squat");
    if (squat) selected.push(squat);
    else add(pattern("squat"), { rotate: false });
    add(pattern(plan.preferredExerciseIds?.includes("rdl") ? "hip_hinge" : "knee_flexion"));
    const preferredQuad = pool.find((item) => !movedAway(item.pattern) && !selected.some((used) => used.id === item.id) && rules?.preferredExerciseIds?.includes(item.id) && (item.pattern === "squat" || item.pattern === "single_leg"));
    const legPress = pool.find((item) => !movedAway(item.pattern) && item.id === "leg_press");
    if (preferredQuad) selected.push(preferredQuad);
    else if (legPress) selected.push(legPress);
    else add(pattern("single_leg"));
    add(pattern("hip_abduction"));
    if (!selected.some((item) => item.pattern === "hip_abduction")) add(pattern("single_leg"));
    const fixedCalf = pool.find((item) => item.pattern === "calf_raise" && rules?.fixedExerciseIds?.includes(item.id));
    const weightedCalf = pool.find((item) => item.id === "squat_machine_calf_raise");
    if (fixedCalf) selected.push(fixedCalf);
    else if (weightedCalf) selected.push(weightedCalf);
    else add(pattern("calf_raise"));
    add(pattern("core_stability"));
    const previousLegs = history.filter((session) => session.label === "LEGS").length;
    add((item) => item.pattern === (previousLegs % 2 ? "core_flexion" : "core_lower") || item.pattern === (previousLegs % 2 ? "core_lower" : "core_flexion"));
    if (durationMinutes >= 60) add(pattern("core_lateral"));
  }
  const sessionKinds = type === "PUSH" ? new Set(["push"])
    : type === "PULL" ? new Set(["back", "biceps", "forearms"])
      : new Set(["legs", "core"]);
  for (const [assignedPattern, session] of Object.entries(assignments)) {
    if (session !== type || !movedHere(assignedPattern) || selected.some((item) => item.pattern === assignedPattern)) continue;
    const requested = chooseForRole((item) => item.pattern === assignedPattern);
    if (requested) selected.push(requested);
  }
  for (const preferredPattern of rules?.priorities || []) {
    if (selected.some((item) => item.pattern === preferredPattern)) continue;
    const requested = chooseForRole((item) => item.pattern === preferredPattern && (sessionKinds.has(item.kind) || movedHere(item.pattern)));
    if (requested && !selected.some((item) => item.id === requested.id)) selected.push(requested);
  }
  for (const id of rules?.fixedExerciseIds || []) {
    const fixed = pool.find((item) => item.id === id);
    if (fixed && (sessionKinds.has(fixed.kind) || movedHere(fixed.pattern)) && !movedAway(fixed.pattern) && !selected.some((item) => item.id === id)) selected.push(fixed);
  }
  const order = rules?.sessionOrders?.[type] || [];
  const priority = rules?.priorities || [];
  const rank = (item) => {
    const orderIndex = order.indexOf(item.pattern);
    const priorityIndex = priority.indexOf(item.pattern);
    return orderIndex < 0 ? 999 : orderIndex * 100 + Math.max(0, priorityIndex);
  };
  if (order.length) selected.sort((a, b) => rank(a) - rank(b));
  else if (priority.length) selected.sort((a, b) => (priority.indexOf(a.pattern) < 0 ? 999 : priority.indexOf(a.pattern)) - (priority.indexOf(b.pattern) < 0 ? 999 : priority.indexOf(b.pattern)));
  return selected;
}

export function makeSession(plan, history = [], date = localDateKey(), forcedType = null, context = null) {
  history = historyThroughDate(history, date);
  const sessionIndex = history.filter((item) => item?.status === "complete" && item.date && item.date <= date).length;
  const choiceShift = 0;
  const type = SPLITS[plan.split]?.sessions.includes(forcedType) || (forcedType === "REST" && plan.restAfterCycle)
    ? forcedType : sessionTypeForDate(plan, history, date, sessionIndex);
  const rawPool = type === "REST" ? [] : context?.durationMinutes && context?.locationId ? availableExercises(context, plan) : [];
  const recommendationPool = rawPool.filter((item) => item.id !== "rdl" || plan.preferredExerciseIds?.includes("rdl"));
  const pool = ["PUSH", "PULL", "LEGS"].includes(type) ? recommendationPool : preferredExerciseOrder(recommendationPool, plan, history);
  const priorBackSessions = history.filter((session) => session.exercises?.some((item) => item.kind === "back")).length;
  const backPool = pool.filter((item) => item.kind === "back");
  const backCount = type === "PULL" ? 4 : backPool.length < 3 ? 1 : 2;
  const lastBackSession = [...history].reverse().find((item) => item.exercises?.some((exercise) => exercise.kind === "back"));
  const lastBackIds = lastBackSession?.exercises.filter((item) => item.kind === "back").map((item) => item.id).sort().join("|");
  let back = pick(pool, "back", backCount, plan.backVariety ? priorBackSessions % Math.max(backPool.length, 1) : 0);
  if (plan.backVariety && backPool.length > 1) {
    for (let shift = 1; shift < backPool.length && back.map((item) => item.id).sort().join("|") === lastBackIds; shift += 1) {
      back = pick(pool, "back", backCount, (priorBackSessions + shift) % backPool.length);
    }
  }
  let chosen;

  if (["PUSH", "PULL", "LEGS"].includes(type)) chosen = choosePplExercises(type, pool, plan, history, Number(context?.durationMinutes) || 60);
  else if (type.startsWith("하체")) chosen = [...pick(pool, "legs", 4, choiceShift), ...pick(pool, "core", 1, choiceShift)];
  else if (type.startsWith("상체")) chosen = [...pick(pool, "push", 2, choiceShift), ...back, ...pick(pool, "biceps", 1, choiceShift)];
  else if (type === "REST") chosen = [];
  else {
    chosen = [
      ...pick(pool, "legs", 1, choiceShift),
      ...pick(pool, "push", 1, choiceShift),
      ...back,
      ...pick(pool, "core", 1),
    ];
    if (context?.durationMinutes >= 75) {
      const extraLeg = pool.find((item) => item.id === "leg_curl" && !chosen.some((selected) => selected.id === item.id))
        || pool.find((item) => item.id === "rdl" && !chosen.some((selected) => selected.id === item.id))
        || pick(pool, "legs", 2, choiceShift).find((item) => !chosen.some((selected) => selected.id === item.id));
      if (extraLeg) chosen.push(extraLeg);
    }
    if (context?.durationMinutes >= 90) {
      const extraPush = pick(pool, "push", 2, choiceShift).find((item) => !chosen.some((selected) => selected.id === item.id));
      if (extraPush) chosen.push(extraPush);
    }
  }

  if (type !== "REST" && !["PUSH", "PULL", "LEGS"].includes(type) && plan.trainingRules) {
    const allowedKinds = type.startsWith("하체") ? new Set(["legs", "core"])
      : type.startsWith("상체") ? new Set(["push", "back", "biceps", "forearms"])
        : new Set(["push", "back", "biceps", "forearms", "legs", "core"]);
    for (const id of plan.fixedExerciseIds || []) {
      const fixed = pool.find((item) => item.id === id && allowedKinds.has(item.kind));
      if (fixed && !chosen.some((item) => item.id === id)) chosen.push(fixed);
    }
    for (const preferredPattern of plan.priorities || []) {
      if (chosen.some((item) => item.pattern === preferredPattern)) continue;
      const preferred = pool.find((item) => item.pattern === preferredPattern && allowedKinds.has(item.kind));
      if (preferred) chosen.push(preferred);
    }
  }

  let unique = [...new Map(chosen.map((exercise) => [exercise.id, exercise])).values()];
  const assignedRequired = unique.filter((exercise) => plan.patternSessions?.[exercise.pattern] === type && DEFAULT_PATTERN_SESSIONS[exercise.pattern] !== type);
  const requiredByRules = unique.filter((exercise) => plan.fixedExerciseIds?.includes(exercise.id) || plan.priorities?.includes(exercise.pattern) || assignedRequired.includes(exercise));
  const duration = Number(context?.durationMinutes) || 60;
  if (duration <= 45 && ["PUSH", "PULL", "LEGS"].includes(type)) {
    const keepPatterns = type === "PUSH"
      ? duration <= 30 ? ["horizontal_press", "lateral_raise", "rear_delt", "elbow_extension"] : ["horizontal_press", "incline_press", "lateral_raise", "rear_delt", "elbow_extension"]
      : type === "PULL" ? duration <= 30 ? ["vertical_pull", "horizontal_pull", "elbow_flexion", "forearms"] : ["vertical_pull", "horizontal_pull", "upper_back", "lat_isolation", "elbow_flexion", "forearms"]
        : duration <= 30 ? ["squat", "knee_flexion", "hip_hinge", "core_stability"] : ["squat", "knee_flexion", "hip_hinge", "hip_abduction", "calf_raise", "core_stability"];
    const kept = [];
    for (const wanted of keepPatterns) {
      const item = unique.find((candidate) => !kept.includes(candidate) && (wanted === "forearms" ? candidate.kind === "forearms" : candidate.pattern === wanted));
      if (item) kept.push(item);
    }
    if (type === "LEGS" && duration <= 45 && kept.length < (duration <= 30 ? 4 : 6)) {
      for (const item of unique.filter((candidate) => !kept.includes(candidate))) {
        if (kept.length >= (duration <= 30 ? 4 : 6)) break;
        kept.push(item);
      }
      kept.sort((a, b) => unique.indexOf(a) - unique.indexOf(b));
    }
    unique = kept;
  } else if (duration <= 30) {
    const requiredTargets = type === "PUSH" ? ["가슴", "삼두", "어깨"] : type === "PULL" ? ["등", "이두"] : type === "LEGS" ? ["하체", "코어"] : [];
    const required = requiredTargets.map((target) => unique.find((item) => item.target === target || (target === "등" && item.target === "광배"))).filter(Boolean);
    unique = [...new Map([...required, ...unique].map((item) => [item.id, item])).values()].slice(0, 4);
  }
  unique = [...new Map([...unique, ...requiredByRules].map((item) => [item.id, item])).values()];
  const order = plan.sessionOrders?.[type] || [];
  const priorities = plan.priorities || [];
  const rank = (exercise) => {
    const ordered = order.indexOf(exercise.pattern);
    const priority = priorities.indexOf(exercise.pattern);
    return [ordered < 0 ? 999 : ordered, priority < 0 ? 999 : priority];
  };
  unique.sort((a, b) => rank(a)[0] - rank(b)[0] || rank(a)[1] - rank(b)[1]);
  const generated = {
    id: `${date}-${sessionIndex}`,
    date,
    label: type,
    status: "draft",
    planVersion: plan.version || 1,
    historyKey: historyFingerprint(history, date),
    context,
    generalWarmup: { ...generalWarmupForType(type), completed: false },
    exercises: unique.reduce((planned, exercise, index) => {
      const priority = plan.fixedExerciseIds?.includes(exercise.id) || plan.priorities?.includes(exercise.pattern) ? "essential" : Number(context?.durationMinutes) <= 30
        ? index < Math.min(2, unique.length) ? "essential" : "recommended"
        : index < Math.min(2, unique.length) ? "essential" : index < Math.max(3, unique.length - 1) ? "recommended" : "optional";
      const volumePlan = volumeAdjustedSets(exercise, planned);
      const sets = type === "LEGS" && exercise.kind === "core" ? Math.min(2, volumePlan.sets) : volumePlan.sets;
      const roles = exerciseMuscleRoles(exercise);
      planned.push({
      ...exercise,
      baseSets: type === "LEGS" && exercise.kind === "core" ? Math.min(2, exercise.sets) : exercise.sets,
      loadBasis: loadBasisForExercise(exercise, context),
      equipmentKey: equipmentKeyForExercise(exercise, context),
      priority,
      sets,
      targetSets: sets,
      optionalSets: Math.max(0, sets - (index < Math.min(2, unique.length) ? 2 : 1)),
       warmupSets: exercise.kind === "core" || exercise.pattern === "calf_raise" ? 0
         : exercise.id === "squat" || index === 0 ? 2 : ["push", "back", "legs"].includes(exercise.kind) ? 1 : 0,
      minimumSets: priority === "essential" ? 2 : 1,
      maximumSets: priority === "essential" ? 4 : 3,
      setAdjustmentReason: sets < exercise.sets ? volumePlan.reason || "운동 시간과 누적 사용 근육을 반영해 세트 수를 조절" : "",
      warmupCompleted: false,
      completedWarmups: [],
      completedSets: [],
      pattern: exercise.pattern || exercise.kind,
      muscles: roles.primary,
      joints: exercise.joints || (exercise.target === "가슴" ? ["shoulder", "elbow"] : exercise.target === "삼두" || exercise.target === "이두" ? ["elbow"] : exercise.target === "등" || exercise.target === "광배" || exercise.target.includes("어깨") ? ["shoulder"] : exercise.target === "하체" || exercise.target.includes("허벅지") ? ["hip", "knee"] : exercise.target === "종아리" ? ["ankle"] : exercise.target === "코어" ? ["spine"] : []),
      indirectMuscles: roles.secondary,
      measurement: exercise.measurement || (exercise.reps?.includes("초") ? "hold_seconds" : exercise.equipment === "맨몸" ? "bodyweight_reps" : "reps_weight"),
      });
      return planned;
    }, []),
  };
  return fitInitialSession(generated, history, plan);
}

function fitInitialSession(session, history, plan) {
  if (!session.context?.durationMinutes || !session.exercises.length) return session;
  let fitted = adaptRemainingVolume(session, history, session.date);
  const deferredExercises = [];
  for (let index = fitted.exercises.length - 1; index >= 0 && fitted.timeOverrun; index -= 1) {
    const exercise = fitted.exercises[index];
    if (exercise.priority !== "essential") continue;
    while (exercise.sets > exercise.minimumSets && fitted.timeOverrun) {
      exercise.sets -= 1;
      exercise.targetSets = exercise.sets;
      exercise.optionalSets = Math.max(0, exercise.sets - exercise.minimumSets);
      exercise.setAdjustmentReason = "오늘 가능한 시간에 맞춰 최소 본세트를 배분했습니다.";
      fitted.estimatedSeconds = estimatedSessionSeconds(fitted);
      fitted.timeOverrun = fitted.estimatedSeconds > fitted.remainingSeconds;
    }
  }
  // Preserve the two main movements and explicit priorities. If even these do
  // not fit, retain them and expose the conflict instead of hiding the overrun.
  while (fitted.timeOverrun) {
    const index = fitted.exercises.findLastIndex((exercise) => exercise.priority === "optional"
      && !plan.fixedExerciseIds?.includes(exercise.id) && !plan.priorities?.includes(exercise.pattern));
    if (index < 0) break;
    const exercises = [...fitted.exercises];
    const [removed] = exercises.splice(index, 1);
    deferredExercises.unshift({ exerciseId: removed.id, name: removed.name, reason: "오늘 가능한 시간에 맞춰 제외" });
    fitted = { ...fitted, exercises, estimatedSeconds: estimatedSessionSeconds({ ...fitted, exercises }) };
    fitted.timeOverrun = fitted.estimatedSeconds > fitted.remainingSeconds;
  }
  return { ...fitted, exercises: fitted.exercises.map((exercise) => ({ ...exercise, budgetSets: exercise.sets })), deferredExercises };
}

export function createPlannedExercise(exercise, context, overrides = {}) {
  const sets = Number(overrides.sets ?? exercise.sets) || 3;
  return {
    ...normalizeExerciseRecord(exercise), baseSets: exercise.sets, sets, targetSets: sets,
    minimumSets: 1, maximumSets: Math.max(sets, 3), priority: "recommended",
    warmupSets: exercise.kind === "core" || exercise.pattern === "calf_raise" ? 0 : 1,
    loadBasis: loadBasisForExercise(exercise, context), equipmentKey: equipmentKeyForExercise(exercise, context),
    warmupCompleted: false, completedWarmups: [], completedSets: [], ...overrides,
  };
}

export function replaceExercise(session, index, replacementId) {
  const replacement = EXERCISES.find((exercise) => exercise.id === replacementId);
  if (!replacement || index < 0 || index >= session.exercises.length) return session;
  const current = session.exercises[index];
  if (current.completedSets?.some((set) => set.pain || set.formFailure) === false && current.completedSets?.length) return session;
  if (session.exercises.some((exercise, at) => at !== index && exercise.id === replacementId)) return session;
  const plannedSets = current.completedSets?.length ? replacement.sets : Math.min(Number(current.sets) || replacement.sets, replacement.sets);
  return withSessionTimeBudget({
    ...session,
    exercises: session.exercises.map((exercise, at) => at === index ? createPlannedExercise(replacement, session.context, { sets: plannedSets, targetSets: plannedSets, minimumSets: Math.min(current.minimumSets || 1, plannedSets), priority: current.priority || "recommended", setAdjustmentReason: current.setAdjustmentReason || "", startConfirmed: false, warmupSkipped: false, replacedExercise: current }) : exercise),
  });
}

export function applyExerciseIds(session, ids, plan) {
  if (!session.context?.durationMinutes || !session.context?.locationId) return session;
  const allowed = new Set(availableExercises(session.context, plan).map((item) => item.id));
  const recorded = session.exercises.filter((item) => item.startConfirmed || item.warmupCompleted || item.warmupSkipped || item.completedWarmups?.length || item.completedSets?.length || recordedExercises({ exercises: [item] }).length);
  const recordedIds = new Set(recorded.map((item) => item.id));
  const unique = [...new Set([...recordedIds, ...ids])].filter((id) => recordedIds.has(id) || allowed.has(id));
  if (unique.length < 2) return session;
  return withSessionTimeBudget({
    ...session,
    exercises: unique.map((id) => session.exercises.find((item) => item.id === id) || createPlannedExercise(EXERCISES.find((item) => item.id === id), session.context)),
  });
}
