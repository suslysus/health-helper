import { DEFAULT_LOCATIONS, normalizeIntake } from "./program.js";

const STORAGE_KEY = "health-helper-v1";

function currentPlan(raw) {
  if (!raw) return null;
  const { daysPerWeek: _daysPerWeek, durationMinutes: _durationMinutes, ...plan } = raw;
  return plan;
}

export function loadAppData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") {
      return {
        intake: saved.intake ? normalizeIntake(saved.intake) : null,
        plan: currentPlan(saved.plan),
        drafts: saved.drafts ?? {},
        history: Array.isArray(saved.history) ? saved.history : [],
        revisions: Array.isArray(saved.revisions) ? saved.revisions : [],
        locations: Array.isArray(saved.locations) ? saved.locations.map((item) => ({
          ...item,
          ready: item.ready ?? !["gym", "home"].includes(item.id),
        })) : DEFAULT_LOCATIONS,
      };
    }
  } catch {
    // Corrupt or unavailable browser storage starts a fresh local profile.
  }
  return { intake: null, plan: null, drafts: {}, history: [], revisions: [], locations: DEFAULT_LOCATIONS };
}

export function saveAppData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
