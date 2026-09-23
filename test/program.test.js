import test from "node:test";
import assert from "node:assert/strict";
import { INITIAL_INTAKE, applyExerciseIds, localPlan, makeSession, normalizePlan, replaceExercise, SPLITS } from "../src/lib/program.js";

const intake = { ...INITIAL_INTAKE, goal: "근육을 늘리고 등 운동마다 종목을 바꾸고 싶다." };
const gym = { durationMinutes: 60, locationId: "gym", locationName: "헬스장", equipment: ["맨몸", "덤벨", "바벨", "케이블"] };

test("계획은 주당 횟수나 고정 시간이 아닌 운동 순환으로 표현한다", () => {
  const plan = localPlan(intake);
  assert.equal(SPLITS[plan.split].sessions.length, 4);
  assert.equal("daysPerWeek" in plan, false);
  assert.equal("durationMinutes" in plan, false);
  assert.equal(normalizePlan({ split: "ppl", daysPerWeek: 6, durationMinutes: 90 }, intake).split, "ppl");
});

test("4회 순환은 주 경계를 넘어 다음 운동 종류로 이어진다", () => {
  const plan = localPlan(intake);
  const dates = ["2026-09-22", "2026-09-25", "2026-09-29", "2026-10-03", "2026-10-07"];
  const history = [];
  for (const date of dates) history.push(makeSession(plan, history, date, null, gym));
  assert.deepEqual(history.map((item) => item.label), ["전신", "상체", "하체", "선호 부위", "전신"]);
});

test("운동 전에는 시간과 장소를 정해야 종목이 생긴다", () => {
  const plan = localPlan(intake);
  const unprepared = makeSession(plan, [], "2026-09-22");
  assert.equal(unprepared.exercises.length, 0);
  assert.equal(applyExerciseIds(unprepared, ["pushup", "superman"], plan).exercises.length, 0);
  const session = makeSession(plan, [], "2026-09-22", null, gym);
  assert.equal(session.exercises.length, 5);
  assert.equal(session.context.durationMinutes, 60);
  assert.equal(session.context.locationId, "gym");
});

test("장소별 기구가 종목에 적용되고 운동 시간에 따라 구성이 달라진다", () => {
  const plan = localPlan(intake);
  const home = makeSession(plan, [], "2026-09-22", null, { ...gym, locationId: "home", equipment: ["맨몸"] });
  assert.ok(home.exercises.every((item) => item.equipment === "맨몸"));
  assert.ok(home.exercises.every((item) => !["pullup", "inverted_row"].includes(item.id)));
  const longer = makeSession(plan, [], "2026-09-22", null, { ...gym, durationMinutes: 90 });
  assert.ok(longer.exercises.length > makeSession(plan, [], "2026-09-22", null, gym).exercises.length);
  const adjustable = makeSession(plan, [], "2026-09-22", null, { ...gym, locationId: "home", equipment: ["조절식 덤벨"] });
  assert.ok(adjustable.exercises.some((item) => item.equipment === "덤벨"));
});

test("등 운동은 직전 등 운동과 다른 종목 구성을 사용한다", () => {
  const plan = localPlan(intake);
  const first = makeSession(plan, [], "2026-09-22", null, gym);
  const second = makeSession(plan, [first], "2026-09-24", null, gym);
  const backIds = (session) => session.exercises.filter((item) => item.kind === "back").map((item) => item.id);
  assert.notDeepEqual(backIds(first), backIds(second));
});

test("종목 수정은 기존 기록을 보존하고 장소에 없는 기구를 AI 제안에서 제외한다", () => {
  const plan = localPlan(intake);
  const session = makeSession(plan, [], "2026-09-22", null, gym);
  const replacement = replaceExercise(session, 0, "lunge");
  assert.equal(replacement.exercises[0].id, "lunge");
  assert.equal(session.exercises[0].id !== "lunge", true);
  const home = makeSession(plan, [], "2026-09-22", null, { ...gym, locationId: "home", equipment: ["맨몸"] });
  const suggested = applyExerciseIds(home, ["bench", "superman", "pushup"], plan);
  assert.deepEqual(suggested.exercises.map((item) => item.id), ["superman", "pushup"]);
});
