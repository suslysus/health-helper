export const RUN_PRESETS = {
  PUSH: {
    mode: "outdoor",
    plan: { type: "interval", targetDistanceMeters: 1_000, targetDurationSeconds: 0, targetPaceSecondsPerKm: 0, workDistanceMeters: 250, workDurationSeconds: 0, recoveryDurationSeconds: 60, repetitions: 4, autoLapDistanceMeters: 0 },
  },
  PULL: {
    mode: "outdoor",
    plan: { type: "easy", targetDistanceMeters: 0, targetDurationSeconds: 25 * 60, targetPaceSecondsPerKm: 0, workDistanceMeters: 0, workDurationSeconds: 0, recoveryDurationSeconds: 0, repetitions: 0, autoLapDistanceMeters: 1_000 },
  },
  LEGS: null,
  REST: null,
};

const clampNumber = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

export function normalizeRunPlan(input = {}) {
  const type = input.type === "interval" ? "interval" : "easy";
  const workDurationSeconds = clampNumber(input.workDurationSeconds, 0, 3_600, 0);
  const workDistanceMeters = clampNumber(input.workDistanceMeters, 0, 10_000, type === "interval" ? 250 : 0);
  return {
    type,
    targetDistanceMeters: clampNumber(input.targetDistanceMeters, 0, 100_000, type === "interval" ? 1_000 : 0),
    targetDurationSeconds: clampNumber(input.targetDurationSeconds, 0, 21_600, type === "easy" ? 1_500 : 0),
    targetPaceSecondsPerKm: clampNumber(input.targetPaceSecondsPerKm, 0, 3_600, 0),
    workDistanceMeters: type === "interval" && workDistanceMeters === 0 && workDurationSeconds === 0 ? 250 : workDistanceMeters,
    workDurationSeconds,
    recoveryDurationSeconds: type === "interval" ? clampNumber(input.recoveryDurationSeconds, 10, 900, 60) : 0,
    repetitions: type === "interval" ? Math.round(clampNumber(input.repetitions, 1, 20, 4)) : 0,
    autoLapDistanceMeters: clampNumber(input.autoLapDistanceMeters, 0, 10_000, 1_000),
  };
}

function makeId(nowMs) {
  return globalThis.crypto?.randomUUID?.() || `run-${Math.trunc(nowMs)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createRunSession({ date, pplType, mode = "outdoor", plan = {} } = {}, nowMs = Date.now()) {
  const timestamp = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  return {
    id: makeId(timestamp),
    date: date || new Date(timestamp).toISOString().slice(0, 10),
    pplType: pplType || null,
    mode: mode === "treadmill" ? "treadmill" : "outdoor",
    plan: normalizeRunPlan(plan),
    status: "running",
    startedAt: timestamp,
    elapsedMs: 0,
    clockAnchorMs: timestamp,
    distanceMeters: 0,
    track: [],
    laps: [],
    accuracyMeters: null,
    gpsStatus: mode === "treadmill" ? "unavailable" : "waiting",
    phase: plan?.type === "interval" ? "work" : "easy",
    intervalIndex: plan?.type === "interval" ? 1 : 0,
    intervalsCompleted: 0,
    phaseStartedElapsedMs: 0,
    phaseDistanceMeters: 0,
    lastFixTimestamp: null,
    lastFix: null,
    lastFixPoint: null,
    lastAutoLapDistanceMeters: 0,
    lastRouteSampleElapsedMs: null,
    routeLatestIsTemporary: false,
    distanceCandidate: null,
    lapSnapshotElapsedMs: 0,
    lapSnapshotDistanceMeters: 0,
  };
}

function addIntervalLap(session, kind, totalElapsedMs = session.elapsedMs) {
  const elapsedMs = Math.max(0, totalElapsedMs - session.lapSnapshotElapsedMs);
  const distanceMeters = Math.max(0, session.distanceMeters - session.lapSnapshotDistanceMeters);
  const lap = { index: session.laps.length + 1, kind, elapsedMs, distanceMeters, totalElapsedMs, totalDistanceMeters: session.distanceMeters };
  return { ...session, laps: [...session.laps, lap], lapSnapshotElapsedMs: totalElapsedMs, lapSnapshotDistanceMeters: session.distanceMeters };
}

function finishIntervalWork(session, totalElapsedMs = session.elapsedMs) {
  const next = addIntervalLap(session, "work", totalElapsedMs);
  const intervalsCompleted = next.intervalsCompleted + 1;
  const finished = intervalsCompleted >= next.plan.repetitions;
  return {
    ...next,
    intervalsCompleted,
    phase: finished ? "cooldown" : "recovery",
    intervalIndex: finished ? next.intervalIndex : intervalsCompleted,
    phaseDistanceMeters: 0,
    phaseStartedElapsedMs: totalElapsedMs,
  };
}

function finishIntervalRecovery(session, totalElapsedMs = session.elapsedMs) {
  const next = addIntervalLap(session, "recovery", totalElapsedMs);
  return { ...next, phase: "work", intervalIndex: next.intervalsCompleted + 1, phaseDistanceMeters: 0, phaseStartedElapsedMs: totalElapsedMs };
}

export function advanceRun(session, nowMs = Date.now()) {
  if (!session || session.status !== "running") return session;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : session.clockAnchorMs;
  const deltaMs = Math.max(0, now - Number(session.clockAnchorMs ?? now));
  let next = { ...session, elapsedMs: session.elapsedMs + deltaMs, clockAnchorMs: Math.max(Number(session.clockAnchorMs ?? now), now) };

  if (next.plan.type === "interval") {
    for (let step = 0; step < next.plan.repetitions * 2 + 2; step += 1) {
      if (next.phase === "recovery") {
        const recoveryEndsAt = next.phaseStartedElapsedMs + next.plan.recoveryDurationSeconds * 1_000;
        if (next.elapsedMs < recoveryEndsAt) break;
        next = finishIntervalRecovery(next, recoveryEndsAt);
        continue;
      }
      if (next.phase !== "work") break;
      if (next.plan.workDistanceMeters > 0 && next.phaseDistanceMeters >= next.plan.workDistanceMeters) {
        next = finishIntervalWork(next);
        continue;
      }
      const workEndsAt = next.phaseStartedElapsedMs + next.plan.workDurationSeconds * 1_000;
      if (next.plan.workDurationSeconds > 0 && next.elapsedMs >= workEndsAt) {
        next = finishIntervalWork(next, workEndsAt);
        continue;
      }
      break;
    }
  }

  if (next.phase === "easy" && next.plan.targetDurationSeconds > 0 && next.elapsedMs >= next.plan.targetDurationSeconds * 1_000) {
    next = { ...next, phase: "cooldown", phaseStartedElapsedMs: next.plan.targetDurationSeconds * 1_000 };
  }
  if (next.phase === "easy" && next.plan.targetDistanceMeters > 0 && next.distanceMeters >= next.plan.targetDistanceMeters) {
    next = { ...next, phase: "cooldown", phaseStartedElapsedMs: next.elapsedMs };
  }
  return next;
}

export function pauseRun(session, nowMs = Date.now()) {
  if (!session || session.status !== "running") return session;
  return { ...advanceRun(session, nowMs), status: "paused", pausedAt: nowMs, lastFix: null, lastFixPoint: null, distanceAnchor: null, distanceCandidate: null, needsAnchorReset: true, gpsStatus: session.mode === "outdoor" ? "waiting" : session.gpsStatus };
}

export function resumeRun(session, nowMs = Date.now()) {
  if (!session || session.status !== "paused") return session;
  return { ...session, status: "running", resumedAt: nowMs, clockAnchorMs: Math.max(Number(session.clockAnchorMs ?? nowMs), Number(nowMs)), lastFix: null, lastFixPoint: null, distanceAnchor: null, distanceCandidate: null, needsAnchorReset: true, gpsStatus: session.mode === "outdoor" ? "waiting" : session.gpsStatus };
}

export function lapRun(session, nowMs = Date.now()) {
  if (!session || !["running", "paused"].includes(session.status)) return session;
  const advanced = session.status === "running" ? advanceRun(session, nowMs) : session;
  const elapsedMs = Math.max(0, advanced.elapsedMs - advanced.lapSnapshotElapsedMs);
  const distanceMeters = Math.max(0, advanced.distanceMeters - advanced.lapSnapshotDistanceMeters);
  if (elapsedMs === 0 && distanceMeters === 0) return advanced;
  if (advanced.plan.type === "interval") {
    if (advanced.phase === "work") return finishIntervalWork(advanced);
    if (advanced.phase === "recovery") return finishIntervalRecovery(advanced);
  }
  const lap = {
    index: advanced.laps.length + 1,
    kind: advanced.plan.type === "interval" && ["work", "recovery"].includes(advanced.phase) ? advanced.phase : "manual",
    elapsedMs,
    distanceMeters,
    totalElapsedMs: advanced.elapsedMs,
    totalDistanceMeters: advanced.distanceMeters,
  };
  return { ...advanced, laps: [...advanced.laps, lap], lapSnapshotElapsedMs: advanced.elapsedMs, lapSnapshotDistanceMeters: advanced.distanceMeters };
}

export function finishRun(session, nowMs = Date.now(), { manualDistanceMeters } = {}) {
  if (!session || session.status === "completed") return session;
  let advanced = session.status === "running" ? advanceRun(session, nowMs) : session;
  const remainingElapsedMs = Math.max(0, advanced.elapsedMs - advanced.lapSnapshotElapsedMs);
  const remainingDistanceMeters = Math.max(0, advanced.distanceMeters - advanced.lapSnapshotDistanceMeters);
  if (remainingElapsedMs > 0 || remainingDistanceMeters > 0) {
    const kind = advanced.plan.type === "interval" && ["work", "recovery"].includes(advanced.phase) ? advanced.phase : "manual";
    advanced = { ...advanced, laps: [...advanced.laps, { index: advanced.laps.length + 1, kind, elapsedMs: remainingElapsedMs, distanceMeters: remainingDistanceMeters, totalElapsedMs: advanced.elapsedMs, totalDistanceMeters: advanced.distanceMeters }], lapSnapshotElapsedMs: advanced.elapsedMs, lapSnapshotDistanceMeters: advanced.distanceMeters };
  }
  const hasManualDistance = manualDistanceMeters !== undefined && manualDistanceMeters !== null && String(manualDistanceMeters).trim() !== "";
  const distance = Number(manualDistanceMeters);
  const distanceMeters = advanced.mode === "treadmill" && hasManualDistance && Number.isFinite(distance) && distance >= 0 ? distance : advanced.distanceMeters;
  return { ...advanced, status: "completed", completedAt: nowMs, distanceMeters, gpsStatus: advanced.mode === "outdoor" ? "stopped" : advanced.gpsStatus, lastFix: null, lastFixPoint: null };
}

function coordinates(fix) {
  const coords = fix?.coords || fix;
  return {
    latitude: Number(coords?.latitude),
    longitude: Number(coords?.longitude),
    accuracy: Number(coords?.accuracy ?? fix?.accuracy),
    timestamp: Number(fix?.timestamp ?? coords?.timestamp),
  };
}

function distanceBetween(a, b) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const earthRadius = 6_371_000;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function ingestRunPosition(session, fix, nowMs = Date.now()) {
  if (!session || session.status !== "running" || session.mode !== "outdoor") return session;
  const advanced = advanceRun(session, nowMs);
  const point = coordinates(fix);
  if (![point.latitude, point.longitude, point.accuracy, point.timestamp].every(Number.isFinite)
    || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) return { ...advanced, gpsStatus: "poor", needsAnchorReset: true };
  if (point.accuracy < 0 || point.accuracy > 25 || point.timestamp > nowMs + 5_000 || nowMs - point.timestamp > 30_000
    || (advanced.lastFixTimestamp != null && point.timestamp <= advanced.lastFixTimestamp)) {
    return { ...advanced, accuracyMeters: point.accuracy, gpsStatus: "poor", needsAnchorReset: true };
  }

  const previous = advanced.lastFix;
  let distanceDelta = 0;
  let distanceCandidate = advanced.distanceCandidate || null;
  let segment = advanced.track.at(-1)?.segment ?? 0;
  let distanceAnchor = advanced.distanceAnchor || previous;
  if (previous) {
    const gapMs = point.timestamp - previous.timestamp;
    const rawDistance = distanceBetween(previous, point);
    if (gapMs > 30_000) {
      segment += 1;
      distanceAnchor = point;
      distanceCandidate = null;
    } else if (rawDistance / (gapMs / 1_000) > 12) {
      return { ...advanced, accuracyMeters: point.accuracy, gpsStatus: "poor", needsAnchorReset: true };
    } else if (advanced.needsAnchorReset) {
      segment += 1;
      distanceAnchor = point;
      distanceCandidate = null;
    } else {
      const accuracy = (previous.accuracy + point.accuracy) / 2;
      const jitterRadius = Math.max(2, Math.min(6, accuracy * 0.4));
      const anchorDistance = distanceAnchor ? distanceBetween(distanceAnchor, point) : rawDistance;
      if (!distanceAnchor) {
        distanceAnchor = point;
        distanceCandidate = null;
      } else if (anchorDistance <= jitterRadius) {
        distanceCandidate = null;
      } else if (distanceCandidate && anchorDistance > distanceCandidate.anchorDistance + Math.max(0.5, jitterRadius * 0.25)) {
        distanceDelta = anchorDistance;
        distanceAnchor = point;
        distanceCandidate = null;
      } else {
        distanceCandidate = { ...point, anchorDistance };
      }
    }
  } else {
    distanceAnchor = point;
    distanceCandidate = null;
    if (advanced.needsAnchorReset && advanced.track.length) segment += 1;
  }
  const distanceMeters = advanced.distanceMeters + distanceDelta;
  const elapsedMs = advanced.elapsedMs;
  const distanceBeforeFix = advanced.distanceMeters;
  const elapsedBeforeFix = advanced.lastFixPoint?.elapsedMs ?? advanced.elapsedMs;
  const accepted = { latitude: point.latitude, longitude: point.longitude, accuracy: point.accuracy, timestamp: point.timestamp, elapsedMs, distanceMeters, segment };
  let track = advanced.track;
  let lastRouteSampleElapsedMs = advanced.lastRouteSampleElapsedMs;
  let routeLatestIsTemporary = advanced.routeLatestIsTemporary;
  const lastRoutePoint = track.at(-1);
  const segmentBoundary = lastRoutePoint && lastRoutePoint.segment !== segment;
  if (!lastRoutePoint || segmentBoundary) {
    track = [...track, accepted];
    lastRouteSampleElapsedMs = elapsedMs;
    routeLatestIsTemporary = false;
  } else if (lastRouteSampleElapsedMs == null || elapsedMs - lastRouteSampleElapsedMs >= 5_000) {
    if (routeLatestIsTemporary) track = [...track.slice(0, -1), accepted];
    else track = [...track, accepted];
    lastRouteSampleElapsedMs = elapsedMs;
    routeLatestIsTemporary = false;
  } else if (routeLatestIsTemporary) {
    track = [...track.slice(0, -1), accepted];
  } else {
    track = [...track, accepted];
    routeLatestIsTemporary = true;
  }
  let next = {
    ...advanced,
    distanceMeters,
    track,
    accuracyMeters: point.accuracy,
    gpsStatus: "active",
    lastFix: point,
    lastFixPoint: accepted,
    lastFixTimestamp: point.timestamp,
    distanceAnchor,
    distanceCandidate,
    lastRouteSampleElapsedMs,
    routeLatestIsTemporary,
    needsAnchorReset: false,
    phaseDistanceMeters: advanced.phaseDistanceMeters + (advanced.phase === "work" ? distanceDelta : 0),
  };

  if (next.plan.type === "easy" && next.plan.autoLapDistanceMeters > 0 && distanceMeters - next.lastAutoLapDistanceMeters >= next.plan.autoLapDistanceMeters) {
    const crossings = Math.floor((distanceMeters - next.lastAutoLapDistanceMeters) / next.plan.autoLapDistanceMeters);
    const laps = [];
    let checkpointDistance = next.lapSnapshotDistanceMeters;
    let checkpointElapsed = next.lapSnapshotElapsedMs;
    for (let i = 0; i < crossings; i += 1) {
      const totalDistanceMeters = next.lastAutoLapDistanceMeters + next.plan.autoLapDistanceMeters * (i + 1);
      const distanceDeltaToFix = distanceMeters - distanceBeforeFix;
      const ratio = distanceDeltaToFix > 0 ? Math.max(0, Math.min(1, (totalDistanceMeters - distanceBeforeFix) / distanceDeltaToFix)) : 1;
      const totalElapsedMs = Math.round(elapsedBeforeFix + (next.elapsedMs - elapsedBeforeFix) * ratio);
      laps.push({ index: next.laps.length + laps.length + 1, kind: "auto", elapsedMs: Math.max(0, totalElapsedMs - checkpointElapsed), distanceMeters: Math.max(0, totalDistanceMeters - checkpointDistance), totalElapsedMs, totalDistanceMeters });
      checkpointDistance = totalDistanceMeters;
      checkpointElapsed = totalElapsedMs;
    }
    next = { ...next, laps: [...next.laps, ...laps], lastAutoLapDistanceMeters: next.lastAutoLapDistanceMeters + crossings * next.plan.autoLapDistanceMeters, lapSnapshotElapsedMs: checkpointElapsed, lapSnapshotDistanceMeters: checkpointDistance };
  }
  return advanceRun(next, nowMs);
}

export function runningRecommendation(pplType, { fatigue = false, postponed = false } = {}) {
  if (postponed || fatigue || ["LEGS", "REST"].includes(String(pplType).toUpperCase())) return null;
  const preset = RUN_PRESETS[String(pplType).toUpperCase()];
  if (!preset) return null;
  return { ...preset, plan: normalizeRunPlan(preset.plan), source: "ppl" };
}
