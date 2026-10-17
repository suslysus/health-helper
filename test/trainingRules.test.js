import test from "node:test";
import assert from "node:assert/strict";
import { currentTrainingRules, normalizeTrainingRules } from "../src/lib/trainingRules.js";
import { EXERCISES, makeSession, normalizePlan, normalizeLocationEquipment } from "../src/lib/program.js";

test("확인한 프로필 설정만 연결되고 원문 수정 시 오래된 해석은 무효화한다", () => {
  const intake = { goal: "근육 증가", preferences: "PPL", experience: "초급", avoid: "", preferMachinesWhenEquivalent: true };
  const rules = normalizeTrainingRules({ split: "ppl", restAfterCycle: true, preferredExerciseIds: ["bench", "unknown"], excludedExerciseIds: ["bench"], fixedExerciseIds: ["bench"], priorities: ["knee_flexion", "unknown"] }, intake, EXERCISES);
  assert.equal(currentTrainingRules(intake, rules), rules);
  assert.equal(currentTrainingRules({ ...intake, preferences: "전신" }, rules), null);
  assert.deepEqual(rules.preferredExerciseIds, []);
  assert.deepEqual(rules.fixedExerciseIds, []);
  assert.deepEqual(rules.priorities, ["knee_flexion"]);
  assert.match(rules.unresolved[0], /unknown/);
});

test("패턴 이동을 세션별로 정규화하고 기존 버전 규칙도 원문이 같으면 읽는다", () => {
  const intake = { goal: "근육 증가", preferences: "후면어깨는 등날로", experience: "초급", avoid: "" };
  const oldRules = { schemaVersion: 1, sourceKey: JSON.stringify([intake.goal, intake.preferences, intake.avoid, intake.experience, true]), split: "ppl", priorities: ["rear_delt"], sessionOrders: { PUSH: [], PULL: [], LEGS: [] } };
  assert.equal(currentTrainingRules(intake, oldRules), oldRules);
  const migrated = normalizeTrainingRules(oldRules, intake, EXERCISES);
  assert.deepEqual(migrated.patternSessions, { rear_delt: "PULL" });
  assert.equal(migrated.schemaVersion, 3);
});

test("같은 문장이라도 확인한 머신·휴식 설정과 명시한 어깨 우선순위가 실제 루틴에 적용된다", () => {
  const intake = { goal: "근육 증가", preferences: "PPL", experience: "초급", avoid: "", preferMachinesWhenEquivalent: true };
  const trainingRules = normalizeTrainingRules({ split: "ppl", restAfterCycle: false, preferMachinesWhenEquivalent: false, preferredExerciseIds: ["bench"], fixedExerciseIds: ["ohp"], priorities: ["vertical_press"] }, intake, EXERCISES);
  const plan = normalizePlan({ trainingRules }, intake);
  const equipment = normalizeLocationEquipment({ equipment: ["맨몸", "바벨", "벤치", "체스트 프레스 머신", "인클라인 해머 프레스 머신", "케이블 머신", "덤벨"] });
  const push = makeSession(plan, [], "2026-09-30", "PUSH", { ...equipment, durationMinutes: 60, locationId: "gym" });
  assert.equal(plan.restAfterCycle, false);
  assert.equal(plan.preferMachinesWhenEquivalent, false);
  assert.equal(push.exercises[0].id, "ohp");
  assert.ok(push.exercises.some((item) => item.id === "bench"));
});
