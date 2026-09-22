const STORAGE_KEY = "health-helper-v1";

export function loadAppData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") {
      return {
        intake: saved.intake ?? null,
        plan: saved.plan ?? null,
        drafts: saved.drafts ?? {},
        history: Array.isArray(saved.history) ? saved.history : [],
        revisions: Array.isArray(saved.revisions) ? saved.revisions : [],
      };
    }
  } catch {
    // Corrupt or unavailable browser storage starts a fresh local profile.
  }
  return { intake: null, plan: null, drafts: {}, history: [], revisions: [] };
}

export function saveAppData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
