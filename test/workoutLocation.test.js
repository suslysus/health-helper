import test from "node:test";
import assert from "node:assert/strict";
import { availableExercises, INITIAL_INTAKE, localPlan, replacementOptions } from "../src/lib/program.js";
import { sessionWithCurrentLocation } from "../src/lib/workoutLocation.js";

test("진행 중 기록을 유지하면서 장소에 추가한 기구를 후보에 반영한다", () => {
  const curl = { id: "leg_curl", name: "레그 컬", target: "뒤 허벅지", pattern: "knee_flexion", completedWarmups: [{ weight: 10, reps: 10 }], completedSets: [{ weight: 20, reps: 12, loadBasis: "total" }], equipmentKey: "original-key" };
  const session = { date: "2026-10-10", label: "LEGS", activeStartedAt: "2026-10-10T09:00:00", elapsedSeconds: 100, activeExerciseIndex: 1, exercises: [curl], context: { locationId: "gym", locationName: "옛 이름", equipment: ["레그 컬 머신"], durationMinutes: 60, readiness: { fatigue: 1 } } };
  const locations = [{ id: "gym", ready: true, name: "헬스장", equipment: ["프론 레그 컬 머신", "시티드 레그 컬 머신"] }];
  const refreshed = sessionWithCurrentLocation(session, locations);
  const pool = availableExercises(refreshed.context, localPlan(INITIAL_INTAKE));
  assert.ok(replacementOptions(curl, pool, session.exercises).some((item) => item.id === "prone_leg_curl"));
  assert.ok(pool.some((item) => item.id === "seated_leg_curl"));
  assert.equal(refreshed.exercises, session.exercises);
  assert.equal(refreshed.exercises[0].equipmentKey, "original-key");
  assert.equal(refreshed.activeStartedAt, session.activeStartedAt);
  assert.equal(refreshed.elapsedSeconds, 100);
  assert.equal(refreshed.context.durationMinutes, 60);
  assert.equal(refreshed.context.readiness, session.context.readiness);
  assert.deepEqual(session.context.equipment, ["레그 컬 머신"]);
});

test("다른 장소와 완료된 기록은 현재 기구로 덮어쓰지 않는다", () => {
  const session = { context: { locationId: "gym", equipment: ["레그 컬"] }, exercises: [] };
  assert.equal(sessionWithCurrentLocation(session, [{ id: "home", ready: true }]), session);
  assert.equal(sessionWithCurrentLocation(session, [{ id: "gym", ready: false }]), session);
  const completed = { ...session, status: "complete", completedAt: "2026-10-10" };
  assert.equal(sessionWithCurrentLocation(completed, [{ id: "gym", ready: true, equipment: ["프론 레그 컬 머신"] }]), completed);
});
