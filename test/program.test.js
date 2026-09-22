import test from "node:test";
import assert from "node:assert/strict";
import { INITIAL_INTAKE, applyExerciseIds, localPlan, makeSession, normalizePlan, replaceExercise } from "../src/lib/program.js";

const intake = { ...INITIAL_INTAKE, goal: "근육을 늘리고 주 3회 꾸준히 운동하고 싶다." };

test("등 운동은 다음 참여 시 다른 종목 구성을 사용한다", () => {
  const plan = localPlan(intake);
  const first = makeSession(plan, intake, [], "2026-09-22");
  const second = makeSession(plan, intake, [first], "2026-09-24");
  const backIds = (session) => session.exercises.filter((item) => item.kind === "back").map((item) => item.id);
  assert.notDeepEqual(backIds(first), backIds(second));
  assert.equal(first.exercises.some((item) => item.kind === "back"), true);
});

test("PPL은 강제되지 않고 일정에 맞춰 기본안이 결정된다", () => {
  assert.equal(localPlan({ ...intake, daysPerWeek: 3 }).split, "full_body");
  assert.equal(localPlan({ ...intake, daysPerWeek: 4 }).split, "upper_lower");
  assert.equal(localPlan({ ...intake, daysPerWeek: 5 }).split, "hybrid");
  assert.equal(normalizePlan({ split: "ppl" }, intake).split, "ppl");
});

test("60분 전신 운동은 주요 부위를 담은 5종목으로 제한한다", () => {
  const session = makeSession(localPlan(intake), intake, [], "2026-09-22");
  assert.equal(session.exercises.length, 5);
  assert.equal(session.exercises.filter((item) => item.kind === "back").length, 2);
  assert.equal(session.exercises.filter((item) => item.kind === "legs").length, 1);
  assert.equal(session.exercises.filter((item) => item.kind === "push").length, 1);
});

test("운동 종류를 바꾸면 다음 날은 변경한 종류의 다음 순서로 진행한다", () => {
  const plan = normalizePlan({ split: "ppl" }, { ...intake, daysPerWeek: 5 });
  const pull = makeSession(plan, intake, [], "2026-09-22", "PULL");
  const next = makeSession(plan, intake, [pull], "2026-09-24");
  assert.equal(pull.label, "PULL");
  assert.equal(next.label, "LEGS");
});

test("운동 교체는 다른 기록과 선택한 운동 목록을 유지한다", () => {
  const session = makeSession(localPlan(intake), intake, [], "2026-09-22");
  const replacement = replaceExercise(session, 0, "lunge");
  assert.equal(replacement.exercises[0].id, "lunge");
  assert.equal(replacement.exercises.length, session.exercises.length);
  assert.equal(session.exercises[0].id !== "lunge", true);
  const suggested = applyExerciseIds(session, ["pullup", "db_row", "pushup"], intake, localPlan(intake));
  assert.deepEqual(suggested.exercises.map((item) => item.id), ["pullup", "db_row", "pushup"]);
});
