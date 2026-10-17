import test from "node:test";
import assert from "node:assert/strict";
import { formatRestTargetDetails, getRestPreview } from "../src/lib/restPreview.js";

const exercise = (id, overrides = {}) => ({
  id,
  name: id,
  target: "등",
  equipment: "머신",
  measurement: "reps_weight",
  sets: 2,
  reps: "8~12",
  warmupSets: 1,
  completedWarmups: [],
  completedSets: [],
  ...overrides,
});

const session = (exercises, restTimer) => ({
  date: "2026-10-09",
  context: { locationId: "gym" },
  exercises,
  restTimer,
});

test("work rest previews the next exercise's warmup, including exercise confirmation", () => {
  const current = exercise("current", { completedWarmups: [{}], completedSets: [{ weight: 20, reps: 10 }, { weight: 20, reps: 10 }] });
  const next = exercise("next");

  const preview = getRestPreview(session([current, next], { kind: "work" }));

  assert.equal(preview.index, 1);
  assert.equal(preview.phase, "warmup");
  assert.equal(preview.stage, "choice");
  assert.ok(preview.recommendation);
});

test("work rest previews the next set in the same exercise", () => {
  const current = exercise("current", { startConfirmed: true, completedWarmups: [{}], completedSets: [{ weight: 20, reps: 10 }] });

  const preview = getRestPreview(session([current], { kind: "work" }));

  assert.equal(preview.index, 0);
  assert.equal(preview.phase, "work");
  assert.equal(preview.stage, "work");
  assert.equal(preview.workSets, 1);
});

test("warmup rest stays with its timer exercise even when an earlier exercise is incomplete", () => {
  const earlier = exercise("earlier");
  const timerExercise = exercise("timer", { startConfirmed: true, completedWarmups: [{}] });

  const preview = getRestPreview(session([earlier, timerExercise], { kind: "warmup", exerciseId: "timer" }));

  assert.equal(preview.exercise.id, "timer");
  assert.equal(preview.phase, "work");
});

test("preview marks target-derived defaults as starting suggestions and respects next-load overrides", () => {
  const unconfirmed = exercise("new", { warmupSets: 0 });
  const sessionWithoutHistory = session([unconfirmed], { kind: "work" });
  const initial = getRestPreview(sessionWithoutHistory);
  assert.equal(initial.hasStartingEvidence, false);

  const overridden = getRestPreview(session([{
    ...unconfirmed,
    startConfirmed: true,
    nextRecommendedWeight: 27.5,
    nextRecommendedReason: "직전 판단에서 정한 중량",
  }], { kind: "work" }));
  assert.equal(overridden.recommendation.weight, 27.5);
  assert.equal(overridden.recommendation.reason, "직전 판단에서 정한 중량");
  assert.equal(overridden.hasStartingEvidence, true);
});

test("preview handles completed and skipped exercises", () => {
  const done = exercise("done", { completedSets: [{}, {}] });
  assert.equal(getRestPreview(session([done], { kind: "work" })).complete, true);

  const skipped = exercise("skipped", { skipped: true });
  const remaining = exercise("remaining", { warmupSets: 0, startConfirmed: true });
  assert.equal(getRestPreview(session([skipped, remaining], { kind: "work" })).exercise.id, "remaining");
});

test("warmup displays its recommended reps and asks for load entry instead of implying zero load", () => {
  const preview = getRestPreview(session([exercise("new")], { kind: "warmup", exerciseId: "new" }));

  assert.equal(preview.phase, "warmup");
  assert.equal(formatRestTargetDetails(preview, { locationId: "gym" }), "중량 직접 설정 · 8회");
});

test("timed work rest transitions to a work target and shows its recommended duration", () => {
  const timed = exercise("plank", {
    name: "플랭크",
    measurement: "hold_seconds",
    reps: "47",
    warmupSkipped: true,
    warmupSets: 0,
    startConfirmed: true,
  });
  const preview = getRestPreview(session([timed], { kind: "work" }));

  assert.equal(preview.phase, "work");
  assert.equal(formatRestTargetDetails(preview), "47초");
});
