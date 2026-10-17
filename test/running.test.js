import test from "node:test";
import assert from "node:assert/strict";
import { advanceRun, createRunSession, finishRun, ingestRunPosition, lapRun, normalizeRunPlan, pauseRun, resumeRun, runningRecommendation } from "../src/lib/running.js";
import { createRunningTracker } from "../src/lib/nativeRunning.js";

const outdoor = (time = 1_000, plan = {}) => createRunSession({ date: "2026-10-09", pplType: "PULL", mode: "outdoor", plan }, time);
const fix = (latitude, longitude, timestamp, accuracy = 5) => ({ coords: { latitude, longitude, accuracy }, timestamp });

test("PPL recommendations select easy PULL, interval PUSH, and no run after fatigue/postponement", () => {
  assert.equal(runningRecommendation("PULL").plan.targetDurationSeconds, 25 * 60);
  assert.equal(runningRecommendation("PUSH").plan.type, "interval");
  assert.equal(runningRecommendation("PUSH").plan.repetitions, 4);
  assert.equal(runningRecommendation("LEGS"), null);
  assert.equal(runningRecommendation("REST"), null);
  assert.equal(runningRecommendation("PULL", { fatigue: true }), null);
  assert.equal(runningRecommendation("PULL", { postponed: true }), null);
});

test("editable run plans normalize each flat target and interval setting", () => {
  assert.deepEqual(normalizeRunPlan({ type: "interval", targetDistanceMeters: 2_000, repetitions: 3, workDistanceMeters: 400, recoveryDurationSeconds: 75 }), {
    type: "interval", targetDistanceMeters: 2_000, targetDurationSeconds: 0, targetPaceSecondsPerKm: 0, workDistanceMeters: 400, workDurationSeconds: 0, recoveryDurationSeconds: 75, repetitions: 3, autoLapDistanceMeters: 1_000,
  });
  assert.equal(normalizeRunPlan({ targetDurationSeconds: -1 }).targetDurationSeconds, 0);
  assert.equal(normalizeRunPlan({ targetPaceSecondsPerKm: 400 }).targetPaceSecondsPerKm, 400);
});

test("pause freezes both elapsed time and distance, and resume starts a fresh GPS anchor", () => {
  let session = ingestRunPosition(outdoor(), fix(0, 0, 1_000), 1_000);
  session = ingestRunPosition(session, fix(0, 0.0005, 6_000), 6_000);
  session = ingestRunPosition(session, fix(0, 0.001, 11_000), 11_000);
  assert.ok(session.distanceMeters > 100);
  const paused = pauseRun(session, 21_000);
  assert.equal(paused.elapsedMs, 20_000);
  const stillPaused = advanceRun(paused, 80_000);
  assert.equal(stillPaused.elapsedMs, 20_000);
  assert.equal(stillPaused.distanceMeters, paused.distanceMeters);
  const resumed = resumeRun(paused, 80_000);
  assert.equal(resumed.elapsedMs, 20_000);
  const afterResume = ingestRunPosition(resumed, fix(0, 0.002, 81_000), 81_000);
  assert.equal(afterResume.distanceMeters, resumed.distanceMeters);
  const candidate = ingestRunPosition(afterResume, fix(0, 0.003, 91_000), 91_000);
  const next = ingestRunPosition(candidate, fix(0, 0.004, 101_000), 101_000);
  assert.ok(next.distanceMeters > afterResume.distanceMeters);
});

test("GPS rejects inaccurate, stale, out-of-order, and unrealistic fixes", () => {
  const first = ingestRunPosition(outdoor(), fix(0, 0, 1_000), 1_000);
  const count = first.track.length;
  assert.equal(ingestRunPosition(first, fix(0, 0.001, 2_000, 26), 2_000).track.length, count);
  assert.equal(ingestRunPosition(first, fix(0, 0.001, 900), 2_000).track.length, count);
  assert.equal(ingestRunPosition(first, fix(0, 0.001, 2_000), 40_000).track.length, count);
  assert.equal(ingestRunPosition(first, fix(0, 0.001, 2_000), 2_000).track.length, count);
});

test("a poor GPS point starts a new track segment without bridging the gap", () => {
  let session = ingestRunPosition(outdoor(), fix(0, 0, 1_000), 1_000);
  session = ingestRunPosition(session, fix(0, 0.001, 2_000, 30), 2_000);
  session = ingestRunPosition(session, fix(0, 0.00001, 3_000), 3_000);
  assert.deepEqual(session.track.map((point) => point.segment), [0, 1]);
  assert.equal(session.distanceMeters, 0);
});

test("one hertz fixes at a steady three meters per second preserve real running distance", () => {
  let session = ingestRunPosition(outdoor(0), fix(0, 0, 0, 5), 0);
  for (let second = 1; second <= 100; second += 1) {
    session = ingestRunPosition(session, fix(0, second * 3 / 111_195, second * 1_000, 5), second * 1_000);
  }
  assert.ok(session.distanceMeters >= 294 && session.distanceMeters <= 306, `${session.distanceMeters}m`);
  assert.ok(session.track.length >= 20 && session.track.length <= 22, `${session.track.length} route points`);
  assert.equal(session.track[0].elapsedMs, 0);
  assert.equal(session.track.at(-1).elapsedMs, 100_000);
  assert.ok(session.track.every((point) => point.segment === 0));
});

test("stationary GPS jitter does not inflate distance and accumulated movement remains measurable", () => {
  let session = ingestRunPosition(outdoor(), fix(0, 0, 1_000, 4), 1_000);
  session = ingestRunPosition(session, fix(0, 0.00001, 2_000, 4), 2_000);
  assert.equal(session.distanceMeters, 0);
  session = ingestRunPosition(session, fix(0, 0.0001, 3_000, 4), 3_000);
  assert.equal(session.distanceMeters, 0);
  session = ingestRunPosition(session, fix(0, 0.0002, 4_000, 4), 4_000);
  assert.ok(session.distanceMeters > 5);
});

test("bounded stationary GPS oscillation does not accumulate a false route", () => {
  let session = ingestRunPosition(outdoor(), fix(0, 0, 1_000, 5), 1_000);
  for (let sample = 1; sample <= 20; sample += 1) {
    const longitude = sample % 2 ? 4 / 111_195 : -4 / 111_195;
    session = ingestRunPosition(session, fix(0, longitude, 1_000 + sample * 1_000, 5), 1_000 + sample * 1_000);
  }
  assert.equal(session.distanceMeters, 0);
});

test("easy runs auto-lap at one kilometer and manual laps use delta snapshots once", () => {
  let session = ingestRunPosition(outdoor(0), fix(0, 0, 0), 0);
  for (const [seconds, meters] of [[30, 300], [60, 600], [90, 900], [120, 1_200], [150, 1_500], [180, 1_800], [210, 2_100], [240, 2_400]]) {
    session = ingestRunPosition(session, fix(0, meters / 111_195, seconds * 1_000), seconds * 1_000);
  }
  assert.equal(session.laps.length, 2);
  assert.equal(session.laps[0].kind, "auto");
  assert.equal(session.laps[0].elapsedMs, 110_000);
  assert.equal(session.laps[1].elapsedMs, 110_000);
  const withManual = lapRun(session, 251_000);
  assert.equal(withManual.laps.length, 3);
  assert.equal(withManual.laps[2].elapsedMs, 31_000);
  assert.equal(lapRun(withManual, 251_000).laps.length, 3);
});

test("manual interval laps record phase deltas and advance work then recovery", () => {
  let session = createRunSession({ mode: "treadmill", plan: { type: "interval", repetitions: 3, workDistanceMeters: 250, recoveryDurationSeconds: 60 } }, 1_000);
  session = advanceRun(session, 61_000);
  session = lapRun(session, 61_000);
  assert.equal(session.laps[0].kind, "work");
  assert.equal(session.laps[0].elapsedMs, 60_000);
  assert.equal(session.phase, "recovery");
  session = advanceRun(session, 121_000);
  assert.equal(session.laps[1].kind, "recovery");
  assert.equal(session.laps[1].elapsedMs, 60_000);
  assert.equal(session.phase, "work");
  assert.equal(session.intervalIndex, 2);
});

test("treadmill getState catch-up advances every elapsed interval boundary exactly once", () => {
  const session = createRunSession({ mode: "treadmill", plan: { type: "interval", workDistanceMeters: 0, workDurationSeconds: 60, recoveryDurationSeconds: 60, repetitions: 3 } }, 1_000);
  const caughtUp = advanceRun(session, 301_000);
  assert.equal(caughtUp.elapsedMs, 300_000);
  assert.equal(caughtUp.phase, "cooldown");
  assert.deepEqual(caughtUp.laps.map((lap) => [lap.kind, lap.totalElapsedMs, lap.elapsedMs]), [
    ["work", 60_000, 60_000],
    ["recovery", 120_000, 60_000],
    ["work", 180_000, 60_000],
    ["recovery", 240_000, 60_000],
    ["work", 300_000, 60_000],
  ]);
  assert.equal(advanceRun(caughtUp, 500_000).laps.length, 5);
});

test("interval phase advances through work, timed recovery, next work, and cooldown", () => {
  let session = createRunSession({ mode: "outdoor", plan: { type: "interval", repetitions: 2, workDistanceMeters: 100, recoveryDurationSeconds: 60 } }, 1_000);
  assert.equal(session.intervalIndex, 1);
  session = ingestRunPosition(session, fix(0, 0, 1_000), 1_000);
  session = ingestRunPosition(session, fix(0, 0.001, 11_000), 11_000);
  session = ingestRunPosition(session, fix(0, 0.002, 21_000), 21_000);
  assert.equal(session.phase, "recovery");
  assert.equal(session.laps.at(-1).kind, "work");
  session = ingestRunPosition(session, fix(0, 0.002, 31_000), 31_000);
  session = ingestRunPosition(session, fix(0, 0.002, 51_000), 51_000);
  session = ingestRunPosition(session, fix(0, 0.002, 71_000), 71_000);
  session = advanceRun(session, 81_000);
  assert.equal(session.phase, "work");
  assert.equal(session.intervalIndex, 2);
  session = ingestRunPosition(session, fix(0, 0.003, 91_000), 91_000);
  session = ingestRunPosition(session, fix(0, 0.004, 101_000), 101_000);
  assert.equal(session.phase, "cooldown");
  assert.deepEqual(session.laps.map((lap) => lap.kind), ["work", "recovery", "work"]);
});

test("finish records optional treadmill distance and remains idempotent", () => {
  let session = createRunSession({ mode: "treadmill", plan: { type: "easy" } }, 5_000);
  session = advanceRun(session, 65_000);
  assert.equal(session.gpsStatus, "unavailable");
  const finished = finishRun(session, 70_000, { manualDistanceMeters: 2_500 });
  assert.equal(finished.elapsedMs, 65_000);
  assert.equal(finished.distanceMeters, 2_500);
  assert.equal(finishRun(finished, 100_000).completedAt, 70_000);
  assert.equal(finishRun(session, 70_000, { manualDistanceMeters: "" }).distanceMeters, 0);
  const outdoorRun = createRunSession({ mode: "outdoor" }, 5_000);
  assert.equal(finishRun(outdoorRun, 6_000, { manualDistanceMeters: 2_500 }).distanceMeters, 0);
});

test("browser adapter asks for GPS only on explicit start and never creates a denied-permission session", async () => {
  const priorNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let denied;
  const errors = [];
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { geolocation: {
    watchPosition(_success, failure) { denied = failure; return 17; },
    clearWatch() {},
  } } });
  const tracker = createRunningTracker({ onError: (error) => errors.push(error) });
  try {
    assert.equal(tracker.getState instanceof Function, true);
    assert.equal((await tracker.getState()).session, null);
    const start = tracker.start({ mode: "outdoor", plan: {} });
    denied({ code: 1, message: "Permission denied" });
    await assert.rejects(start, /Permission denied/);
    assert.equal((await tracker.getState()).session, null);
    assert.equal(errors.length, 1);
  } finally {
    await tracker.destroy();
    if (priorNavigator) Object.defineProperty(globalThis, "navigator", priorNavigator);
    else delete globalThis.navigator;
  }
});

test("browser adapter restores paused runs, cuts GPS across pause, and advances treadmill time on getState", async () => {
  const priorNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;
  let success;
  let watchSequence = 0;
  const cleared = [];
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { geolocation: {
    watchPosition(onSuccess) { success = onSuccess; return ++watchSequence; },
    clearWatch(id) { cleared.push(id); },
  } } });
  const tracker = createRunningTracker();
  let treadmill;
  try {
    const start = tracker.start({ mode: "outdoor", plan: {} });
    assert.equal((await tracker.getState()).session, null);
    success(fix(0, 0, now));
    assert.equal((await start).session.status, "running");
    now = 11_000;
    success(fix(0, 0.001, now));
    now = 21_000;
    success(fix(0, 0.002, now));
    const beforePause = (await tracker.getState()).session.distanceMeters;
    now = 31_000;
    await tracker.pause();
    assert.deepEqual(cleared, [1]);
    now = 80_000;
    const resume = tracker.resume();
    success(fix(0, 0.003, 81_000));
    await resume;
    assert.equal((await tracker.getState()).session.distanceMeters, beforePause);
    now = 91_000;
    success(fix(0, 0.004, now));
    now = 101_000;
    success(fix(0, 0.005, now));
    assert.ok((await tracker.getState()).session.distanceMeters > beforePause);
    await tracker.destroy();

    const restored = createRunSession({ mode: "treadmill", plan: {} }, 5_000);
    treadmill = createRunningTracker({ initialSession: restored });
    assert.equal((await treadmill.getState()).session.status, "paused");
    // A backwards browser clock cannot erase time already included in the paused snapshot.
    now = 95_000;
    await treadmill.resume();
    now = 125_000;
    assert.equal((await treadmill.getState()).session.elapsedMs, 24_000);
    const completed = await treadmill.finish({ manualDistanceMeters: "" });
    assert.equal(completed.session.status, "completed");
    assert.equal((await treadmill.acknowledgeFinished({ id: "another-run" })).session.id, completed.session.id);
    assert.equal((await treadmill.acknowledgeFinished({ id: completed.session.id })).session, null);
    await treadmill.destroy();
  } finally {
    await tracker.destroy();
    await treadmill?.destroy();
    Date.now = originalNow;
    if (priorNavigator) Object.defineProperty(globalThis, "navigator", priorNavigator);
    else delete globalThis.navigator;
  }
});
