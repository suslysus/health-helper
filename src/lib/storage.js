import { DEFAULT_LOCATIONS, generalWarmupForType, makeSession, normalizeIntake, normalizeLocationEquipment, normalizePlan, SPLITS } from "./program.js";
import { normalizeNutritionSettings } from "./body.js";
import { hasStartedSession, normalizeWorkoutSession } from "./workoutHistory.js";
export { hasStartedSession } from "./workoutHistory.js";

const STORAGE_KEY = "health-helper-v1";

function currentPlan(raw, intake) {
  if (!raw) return null;
  const { daysPerWeek: _daysPerWeek, durationMinutes: _durationMinutes, ...plan } = raw;
  const normalized = normalizePlan(plan, intake);
  const preferencesUpdated = raw.preferenceRulesVersion !== normalized.preferenceRulesVersion;
  const routineUpdated = raw.routineRulesVersion !== normalized.routineRulesVersion;
  return preferencesUpdated || routineUpdated
    ? { ...normalized, version: Math.max(1, Number(raw.version) || 1) + 1, changeSummary: preferencesUpdated ? "프로필 선호 해석 오류 수정" : "프로필 운동일 배치와 종목 추천 규칙 갱신" }
    : normalized;
}

function migrateSession(raw) {
  if (!raw || !Array.isArray(raw.exercises)) return raw;
  const generalWarmup = raw.generalWarmup?.completed
    ? raw.generalWarmup
    : { ...raw.generalWarmup, ...generalWarmupForType(raw.label), completed: false };
  return normalizeWorkoutSession({ ...raw, generalWarmup, exercises: raw.exercises.map((exercise) => ({
    ...exercise,
    completedWarmups: exercise.completedWarmups || [],
    completedSets: (exercise.completedSets || []).map((set) => ({ status: "normal", ...set })),
    priority: exercise.priority || "recommended",
    targetSets: exercise.targetSets || exercise.sets || 3,
    minimumSets: exercise.minimumSets || 1,
    warmupSets: exercise.warmupSets ?? 1,
    pattern: exercise.pattern || exercise.kind || "general",
    maximumSets: exercise.maximumSets || exercise.targetSets || exercise.sets || 3,
    measurement: exercise.measurement || (exercise.reps?.includes("초") ? "hold_seconds" : exercise.equipment === "맨몸" ? "bodyweight_reps" : "reps_weight"),
  })) });
}

function migrateLocation(location) {
  return { ...location, ...normalizeLocationEquipment(location), ready: location.ready ?? !["gym", "home"].includes(location.id) };
}

function sampleRunTrack(track, intervalMs = 5_000) {
  if (!Array.isArray(track) || track.length <= 2) return Array.isArray(track) ? [...track] : track;
  const keep = new Set([0, track.length - 1]);
  const pointTime = (point) => {
    const elapsed = Number(point?.elapsedMs);
    if (Number.isFinite(elapsed)) return elapsed;
    const timestamp = Number(point?.timestamp);
    return Number.isFinite(timestamp) ? timestamp : null;
  };
  let lastSampleTime = pointTime(track[0]);
  for (let index = 1; index < track.length; index += 1) {
    const previous = track[index - 1];
    const point = track[index];
    if (point?.segment !== previous?.segment) {
      keep.add(index - 1);
      keep.add(index);
      const time = pointTime(point);
      if (time != null) lastSampleTime = time;
      continue;
    }
    const time = pointTime(point);
    if (time != null && lastSampleTime != null && time - lastSampleTime >= intervalMs) {
      keep.add(index);
      lastSampleTime = time;
    } else if (time != null && lastSampleTime == null) {
      lastSampleTime = time;
      keep.add(index);
    }
  }
  return [...keep].sort((a, b) => a - b).map((index) => track[index]);
}

function compactRunForStorage(run) {
  if (!run || !Array.isArray(run.track)) return run;
  return { ...run, track: sampleRunTrack(run.track) };
}

export function loadAppData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") {
      const intake = saved.intake ? normalizeIntake(saved.intake) : null;
      const plan = currentPlan(saved.plan, intake);
      const validSessionLabels = new Set(plan ? [...(SPLITS[plan.split]?.sessions || []), "REST"] : []);
      const history = Array.isArray(saved.history) ? saved.history.map(migrateSession) : [];
      const drafts = Object.fromEntries(Object.entries(saved.drafts ?? {})
        .map(([date, session]) => [date, migrateSession(session)])
        .filter(([, session]) => !plan || validSessionLabels.has(session?.label) || hasStartedSession(session))
        .map(([date, session]) => {
          const started = hasStartedSession(session);
          if (!plan || started || Number(session.planVersion || 1) === Number(plan.version || 1)) return [date, session];
          return [date, makeSession(plan, history, date, session.label, session.context)];
        }));
      const nutritionSettings = saved.nutritionSettings == null ? null : normalizeNutritionSettings(saved.nutritionSettings);
      return {
        intake,
        plan,
        drafts,
        history,
        revisions: Array.isArray(saved.revisions) ? saved.revisions : [],
        meals: Array.isArray(saved.meals) ? saved.meals : [],
        favoriteProducts: Array.isArray(saved.favoriteProducts) ? saved.favoriteProducts : [],
        weights: Array.isArray(saved.weights) ? saved.weights : [],
        postponements: Array.isArray(saved.postponements) ? saved.postponements : [],
        locations: Array.isArray(saved.locations) ? saved.locations.map(migrateLocation) : DEFAULT_LOCATIONS,
        ...(Array.isArray(saved.runningHistory) ? { runningHistory: saved.runningHistory } : {}),
        ...(saved.activeRun && typeof saved.activeRun === "object" ? { activeRun: saved.activeRun } : {}),
        ...(nutritionSettings ? { nutritionSettings } : {}),
      };
    }
  } catch {
    // Corrupt or unavailable browser storage starts a fresh local profile.
  }
  return { intake: null, plan: null, drafts: {}, history: [], revisions: [], locations: DEFAULT_LOCATIONS, meals: [], favoriteProducts: [], weights: [], postponements: [] };
}

export function saveAppData(data) {
  try {
    const serialized = {
      ...data,
      ...(Array.isArray(data.runningHistory) ? { runningHistory: data.runningHistory.map(compactRunForStorage) } : {}),
      ...(data.activeRun ? { activeRun: compactRunForStorage(data.activeRun) } : {}),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
    return true;
  } catch {
    return false;
  }
}
