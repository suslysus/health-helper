import { makeSession, SPLITS } from "./program.js";
import { hasStartedSession, historyFingerprint } from "./workoutHistory.js";
import { sessionWithCurrentLocation } from "./workoutLocation.js";

export function sessionForDate(data, date) {
  const recorded = data.history?.find((session) => session.date === date);
  if (recorded?.status === "complete") return recorded;
  if (!data.plan || !data.intake) return recorded || null;
  const draft = data.drafts?.[date];
  if (hasStartedSession(draft)) return sessionWithCurrentLocation(draft, data.locations);
  if (recorded) return recorded;
  const current = sessionWithCurrentLocation(draft, data.locations);
  const historyKey = historyFingerprint(data.history || [], date);
  const locationChanged = JSON.stringify(current?.context) !== JSON.stringify(draft?.context);
  if (draft && !locationChanged && draft.historyKey === historyKey && draft.planVersion === data.plan.version) return draft;
  const forcedType = draft && (draft.manualType || draft.postponedFrom) && SPLITS[data.plan.split]?.sessions.includes(draft.label) ? draft.label : null;
  const next = makeSession(data.plan, data.history || [], date, forcedType, current?.context);
  return { ...next, ...(draft?.manualType ? { manualType: true } : {}), ...(draft?.postponedFrom ? { postponedFrom: draft.postponedFrom } : {}) };
}
