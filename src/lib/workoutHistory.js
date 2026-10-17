import { EXERCISE_BY_ID, exerciseMuscleRoles } from "./exerciseCatalog.js";

export const WORKOUT_DATA_VERSION = 2;

export function hasStartedSession(session) {
  return Boolean(session?.startedAt || session?.activeStartedAt || session?.generalWarmup?.completed
    || session?.exercises?.some((exercise) => exercise.startConfirmed || exercise.warmupCompleted || exercise.warmupSkipped || exercise.completedSets?.length || exercise.completedWarmups?.length));
}

// This is the only traversal of replacement history. Completed sets on a replaced
// movement still belong to that movement, never to its replacement.
export function recordedExercises(session) {
  const result = [];
  const visited = new Set();
  const visit = (exercise) => {
    if (!exercise || visited.has(exercise)) return;
    visited.add(exercise);
    visit(exercise.replacedExercise);
    if (exercise.completedSets?.length) result.push(exercise);
  };
  for (const exercise of session?.exercises || []) visit(exercise);
  return result;
}

export function historyThroughDate(history = [], date = null) {
  return history.filter((session) => session && session.status !== "draft"
    && (!date || (session.date && session.date <= date)))
    .slice().sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))
      || String(a.completedAt || "").localeCompare(String(b.completedAt || "")));
}

export function normalizeExerciseRecord(raw = {}) {
  const id = raw.exerciseId || raw.id;
  const definition = EXERCISE_BY_ID[id];
  const roles = exerciseMuscleRoles(definition || raw);
  return {
    ...definition, ...raw, id, exerciseId: id,
    ...(definition ? { pattern: definition.pattern || definition.kind, measurement: definition.measurement, tags: definition.tags } : {}),
    primaryMuscles: [...roles.primary], secondaryMuscles: [...roles.secondary],
    muscles: [...roles.primary], indirectMuscles: [...roles.secondary],
    completedWarmups: raw.completedWarmups || [],
    completedSets: (raw.completedSets || []).map((set) => ({ status: "normal", ...set })),
    ...(raw.replacedExercise ? { replacedExercise: normalizeExerciseRecord(raw.replacedExercise) } : {}),
  };
}

export function normalizeWorkoutSession(session) {
  if (!session || !Array.isArray(session.exercises)) return session;
  return { ...session, recordSchemaVersion: WORKOUT_DATA_VERSION, exercises: session.exercises.map(normalizeExerciseRecord) };
}

// Computed from the saved sessions, not a second stored copy that can go stale.
export function exerciseRecords(history, exerciseId, { date = null, locationId = null } = {}) {
  return historyThroughDate(history, date).flatMap((session) => recordedExercises(session)
    .filter((exercise) => (exercise.exerciseId || exercise.id) === exerciseId)
    .filter((exercise) => !locationId || (exercise.locationId || session.context?.locationId || session.locationId) === locationId)
    .map((exercise) => ({ exercise, session })));
}

export function historyFingerprint(history, date) {
  const text = JSON.stringify(historyThroughDate(history, date));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}
