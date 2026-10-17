import test from "node:test";
import assert from "node:assert/strict";
import { localPlan, INITIAL_INTAKE } from "../src/lib/program.js";
import { postponeWorkout, shiftDateKey, undoWorkoutPostponement } from "../src/lib/schedule.js";

test("오늘 운동을 내일로 미뤄도 PPL 종류와 기록 순서는 유지된다", () => {
  const plan = localPlan({ ...INITIAL_INTAKE, preferences: "PPL 후 휴식" });
  const data = { plan, history: [{ date: "2026-09-28", label: "PULL", status: "complete" }], drafts: {}, postponements: [] };
  const postponed = postponeWorkout(data, "2026-09-29", "2026-09-29T08:00:00.000Z");
  assert.equal(shiftDateKey("2026-09-29"), "2026-09-30");
  assert.equal(postponed.postponements[0].label, "LEGS");
  assert.equal(postponed.drafts["2026-09-30"].label, "LEGS");
  assert.equal(postponed.drafts["2026-09-29"], undefined);

  const restored = undoWorkoutPostponement(postponed, "2026-09-29");
  assert.equal(restored.drafts["2026-09-29"].label, "LEGS");
  assert.equal(restored.drafts["2026-09-30"], undefined);
  assert.deepEqual(restored.postponements, []);
});

test("이미 시작한 운동은 하루 미루지 않는다", () => {
  const plan = localPlan({ ...INITIAL_INTAKE, preferences: "PPL 후 휴식" });
  const active = { id: "active", date: "2026-09-29", label: "PUSH", activeStartedAt: Date.now(), exercises: [] };
  const data = { plan, history: [], drafts: { "2026-09-29": active }, postponements: [] };
  assert.equal(postponeWorkout(data, "2026-09-29"), data);
});
