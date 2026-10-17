import { makeSession } from "./program.js";
import { hasStartedSession } from "./workoutHistory.js";
import { shiftDateKey } from "./dates.js";
export { shiftDateKey } from "./dates.js";

export const sessionHasStarted = hasStartedSession;

export function postponeWorkout(data, dateKey, now = new Date().toISOString()) {
  if (!data?.plan || data.history?.some((item) => item.date === dateKey && (item.status === "complete" || sessionHasStarted(item)))) return data;
  const source = data.drafts?.[dateKey] || makeSession(data.plan, data.history || [], dateKey);
  if (!source || sessionHasStarted(source)) return data;

  const targetDate = shiftDateKey(dateKey, 1);
  if (sessionHasStarted(data.drafts?.[targetDate]) || data.history?.some((item) => item.date === targetDate)) return data;
  const moved = { ...source, id: `${targetDate}-postponed`, date: targetDate, postponedFrom: dateKey };
  const drafts = { ...(data.drafts || {}) };
  delete drafts[dateKey];
  drafts[targetDate] = moved;
  const postponements = [
    ...(data.postponements || []).filter((item) => item.date !== dateKey && item.targetDate !== targetDate),
    { date: dateKey, targetDate, label: source.label, createdAt: now },
  ];
  return { ...data, drafts, postponements };
}

export function undoWorkoutPostponement(data, dateKey) {
  const record = (data.postponements || []).find((item) => item.date === dateKey);
  if (!record) return data;
  const drafts = { ...(data.drafts || {}) };
  const moved = drafts[record.targetDate];
  if (moved?.postponedFrom === dateKey && !sessionHasStarted(moved)) {
    drafts[dateKey] = { ...moved, id: `${dateKey}-restored`, date: dateKey, postponedFrom: undefined };
    delete drafts[record.targetDate];
  }
  return { ...data, drafts, postponements: (data.postponements || []).filter((item) => item.date !== dateKey) };
}
