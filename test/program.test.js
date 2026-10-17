import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTrainingRules } from "../src/lib/trainingRules.js";
import { adaptRemainingVolume, availableNextLoad, availablePreviousLoad, equipmentForExercise, equipmentKeyForExercise, EQUIPMENT_CATALOG, EXERCISES, INITIAL_INTAKE, applyExerciseIds, availableExercises, cardioRecommendation, classifyWorkoutInput, cycleLabel, evaluateSet, estimateMealNutrition, exerciseWarmupTarget, generalWarmupForType, localPlan, loadBasisForExercise, makeSession, mergeMealNutrition, nextSessionLoad, normalizeLocationEquipment, normalizePlan, pauseSessionTimer, recommendedSetInput, replaceExercise, replacementOptions, restRecommended, resumeSessionTimer, sessionElapsedSeconds, sessionLoadMetrics, sessionTypeForDate, setFeedbackFromText, shouldEndExercise, SPLITS, volumeAdjustedSets, warmupDecision, workoutFlowGroups, workoutProgress } from "../src/lib/program.js";

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
  for (const date of dates) history.push({ ...makeSession(plan, history, date, null, gym), status: "complete" });
  assert.deepEqual(history.map((item) => item.label), ["전신", "상체", "하체", "선호 부위", "전신"]);
});

test("명시한 PPL 3일 운동 후 1일 휴식은 AI 분류보다 우선한다", () => {
  const explicit = { ...intake, preferences: "가슴 삼두 어깨 -> 등 이두 -> 하체 복근 -> 휴식 순서로 하고 싶다." };
  const plan = normalizePlan({ split: "hybrid", restAfterCycle: false }, explicit);
  assert.equal(plan.split, "ppl");
  assert.equal(plan.restAfterCycle, true);
  assert.equal(cycleLabel(plan), "PPL · 3회 운동 + 1회 휴식 순환");
  assert.equal(makeSession(plan, [], "2026-09-27").label, "PUSH");
});

test("현재 프로필에 연결된 구조화 운동 규칙은 계획 구성을 덮어쓴다", () => {
  const source = { ...intake, preferences: "PPL 선호" };
  const rules = normalizeTrainingRules({ split: "upper_lower", restAfterCycle: false, preferMachinesWhenEquivalent: false, preferredExerciseIds: ["cable_row_wide"], sessionOrders: { PULL: ["upper_back", "vertical_pull"] } }, source, EXERCISES);
  const plan = normalizePlan({ split: "ppl", trainingRules: rules }, source);
  assert.equal(plan.split, "upper_lower");
  assert.equal(plan.restAfterCycle, false);
  assert.equal(plan.preferMachinesWhenEquivalent, false);
  assert.ok(plan.preferredExerciseIds.includes("cable_row_wide"));
  const stale = normalizePlan({ split: "ppl", trainingRules: rules }, { ...source, preferences: "다른 루틴" });
  assert.equal(stale.split, "ppl");
});

test("짧은 운동에서도 고정 종목과 지정 우선 패턴을 실제 종목으로 포함한다", () => {
  const source = { ...intake, preferences: "PPL 선호" };
  const rules = normalizeTrainingRules({ split: "ppl", fixedExerciseIds: ["cable_fly"], priorities: ["vertical_press"] }, source, EXERCISES);
  const plan = normalizePlan({ trainingRules: rules }, source);
  const session = makeSession(plan, [], "2026-09-28", "PUSH", { ...gym, durationMinutes: 30 });
  assert.ok(session.exercises.some((item) => item.id === "cable_fly"));
  assert.ok(session.exercises.some((item) => item.pattern === "vertical_press"));
});

test("프로필 패턴 이동은 출발일의 기본 역할을 대체하고 짧은 운동에서도 유지된다", () => {
  const source = { ...intake, preferences: "후면어깨는 등날로" };
  const rules = normalizeTrainingRules({ split: "ppl", patternSessions: { rear_delt: "PULL" } }, source, EXERCISES);
  const plan = normalizePlan({ trainingRules: rules }, source);
  assert.equal(plan.patternSessions.rear_delt, "PULL");
  const place = normalizeLocationEquipment({ equipment: ["덤벨", "랫 풀다운 머신", "시티드 로우 머신"] });
  const context = { ...gym, equipment: place.equipment, equipmentItems: place.equipmentItems };
  for (const durationMinutes of [30, 45, 60]) {
    const push = makeSession(plan, [], "2026-10-01", "PUSH", { ...context, durationMinutes });
    const pull = makeSession(plan, [], "2026-10-02", "PULL", { ...context, durationMinutes });
    assert.equal(push.exercises.some((item) => item.pattern === "rear_delt"), false);
    assert.ok(pull.exercises.some((item) => item.pattern === "rear_delt"));
  }
});

test("다른 패턴도 세션으로 이동하고, 기구가 없거나 제외된 경우 임의 종목을 추가하지 않는다", () => {
  const source = { ...intake, preferences: "수직 밀기는 PULL 날" };
  const rules = normalizeTrainingRules({ split: "ppl", patternSessions: { vertical_press: "PULL" } }, source, EXERCISES);
  const plan = normalizePlan({ trainingRules: rules }, source);
  const place = normalizeLocationEquipment({ equipment: ["덤벨", "랫 풀다운 머신", "시티드 로우 머신"] });
  const context = { ...gym, equipment: place.equipment, equipmentItems: place.equipmentItems };
  const push = makeSession(plan, [], "2026-10-01", "PUSH", context);
  const pull = makeSession(plan, [], "2026-10-02", "PULL", context);
  assert.equal(push.exercises.some((item) => item.pattern === "vertical_press"), false);
  assert.ok(pull.exercises.some((item) => item.pattern === "vertical_press"));
  const noPressGear = normalizeLocationEquipment({ equipment: ["랫 풀다운 머신", "시티드 로우 머신"] });
  assert.equal(makeSession(plan, [], "2026-10-02", "PULL", { ...context, equipment: noPressGear.equipment, equipmentItems: noPressGear.equipmentItems }).exercises.some((item) => item.pattern === "vertical_press"), false);
  const excludedPlan = normalizePlan({ trainingRules: normalizeTrainingRules({ split: "ppl", patternSessions: { vertical_press: "PULL" }, excludedExerciseIds: ["shoulder_press"] }, source, EXERCISES) }, source);
  assert.equal(makeSession(excludedPlan, [], "2026-10-02", "PULL", context).exercises.some((item) => item.pattern === "vertical_press"), false);
});

test("프로필 문장의 패턴 이동은 기존 정확 일치 규칙에 이동 필드가 없어도 적용된다", () => {
  const source = { ...intake, preferences: "PPL, 후면어깨는 당기는 날" };
  const rules = normalizeTrainingRules({ schemaVersion: 1, split: "ppl", sessionOrders: { PUSH: [], PULL: [], LEGS: [] } }, source, EXERCISES);
  const plan = normalizePlan({ trainingRules: rules }, source);
  assert.equal(plan.patternSessions.rear_delt, "PULL");
  const place = normalizeLocationEquipment({ equipment: ["덤벨", "랫 풀다운 머신"] });
  const context = { ...gym, equipment: place.equipment, equipmentItems: place.equipmentItems };
  assert.equal(makeSession(plan, [], "2026-10-01", "PUSH", context).exercises.some((item) => item.pattern === "rear_delt"), false);
  assert.ok(makeSession(plan, [], "2026-10-02", "PULL", context).exercises.some((item) => item.pattern === "rear_delt"));
});

test("PPL의 LEGS 완료 다음 날만 휴식을 권장한다", () => {
  const plan = normalizePlan({ split: "ppl", restAfterCycle: true }, { ...intake, preferences: "PPL 후 휴식" });
  const history = [{ date: "2026-09-27", label: "LEGS", status: "complete" }];
  assert.equal(restRecommended(plan, history, "2026-09-28"), true);
  assert.equal(restRecommended(plan, history, "2026-09-29"), false);
  assert.equal(restRecommended({ ...plan, restAfterCycle: false }, history, "2026-09-28"), false);
});

test("휴식 순환은 날짜 기준으로 REST 하루를 반영하고 미래 기록은 무시한다", () => {
  const plan = normalizePlan({ split: "ppl" }, { ...intake, preferences: "PPL 후 휴식" });
  const history = [
    { date: "2026-09-27", label: "LEGS", status: "complete" },
    { date: "2026-10-03", label: "PULL", status: "complete" },
  ];
  assert.equal(sessionTypeForDate(plan, history, "2026-09-28"), "REST");
  assert.equal(sessionTypeForDate(plan, history, "2026-09-29"), "PUSH");
  assert.equal(makeSession(plan, history, "2026-09-28").label, "REST");
  assert.equal(makeSession(plan, history, "2026-09-28", "REST", gym).exercises.length, 0);
  assert.equal(restRecommended(null, [], "2026-09-28"), false);
});

test("시간 부족으로 조기 종료해도 완료 기록이면 다음 PPL 순서로 진행한다", () => {
  const plan = normalizePlan({ split: "ppl" }, { ...intake, preferences: "PPL 후 휴식" });
  const history = [{ date: "2026-09-27", label: "PULL", status: "complete", endedEarly: true, exercises: [] }];
  assert.equal(makeSession(plan, history, "2026-09-28", null, gym).label, "LEGS");
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
  const short = makeSession(plan, [], "2026-09-22", null, { ...gym, durationMinutes: 30 });
  assert.ok(short.exercises.every((item) => item.priority !== "optional"));
  assert.ok(short.exercises.filter((item) => item.priority === "essential").every((item) => item.sets >= item.minimumSets));
  assert.ok(short.exercises.every((item) => item.sets <= 3));
  const adjustable = makeSession(plan, [], "2026-09-22", null, { ...gym, locationId: "home", equipment: ["조절식 덤벨"] });
  assert.ok(adjustable.exercises.some((item) => item.equipment === "덤벨"));
});

test("등 운동은 직전 등 운동과 다른 종목 구성을 사용한다", () => {
  const plan = localPlan(intake);
  const first = makeSession(plan, [], "2026-09-22", null, gym);
  const second = makeSession(plan, [{ ...first, status: "complete" }], "2026-09-24", null, gym);
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

test("세트 판단은 red flag, 통증, 폼, 목표 자극, 난이도, 기구, 시간 순서를 지킨다", () => {
  assert.equal(evaluateSet({ redFlag: true, status: "too_easy" }).action, "end_session");
  assert.equal(evaluateSet({ sharpPain: true, formFailure: true }).action, "replace_exercise");
  assert.equal(evaluateSet({ formFailure: true, targetMiss: true }).action, "retest_form");
  assert.equal(evaluateSet({ targetMiss: true, status: "too_heavy" }).action, "change_tempo");
  assert.equal(evaluateSet({ status: "too_heavy", equipmentBusy: true }).action, "reduce_load");
  assert.equal(evaluateSet({ equipmentBusy: true, remainingMinutes: 2 }).action, "other_pattern");
  assert.equal(evaluateSet({ remainingMinutes: 2 }).action, "end_exercise");
  assert.equal(evaluateSet({ rir: 0 }).action, "maintain");
  assert.equal(evaluateSet({ reps: 5, repLower: 6, repUpper: 10 }).action, "reduce_load");
});

test("더블 프로그레션은 모든 목표 세트 상한 반복과 좋은 폼·무통증이 필요하다", () => {
  assert.equal(nextSessionLoad([{ reps: 12, rir: 2 }, { reps: 12, rir: 1 }, { reps: 12, rir: 1 }]).action, "increase_load");
  assert.equal(nextSessionLoad([{ reps: 12, rir: 2 }, { reps: 11, rir: 2 }, { reps: 12, rir: 2 }]).action, "maintain");
  assert.equal(nextSessionLoad([{ reps: 12, rir: 2 }, { reps: 12, rir: 0 }, { reps: 12, rir: 2 }]).action, "maintain");
  assert.equal(nextSessionLoad([{ reps: 12, rir: 2 }, { reps: 12, rir: 1 }, { reps: 12, rir: 1 }], { currentLoad: 40, equipment: "바벨", loadSteps: [1.25] }).nextLoad, 42.5);
  assert.equal(nextSessionLoad([{ weight: 40, reps: 12, rir: 2 }, { weight: 35, reps: 12, rir: 2 }, { weight: 30, reps: 12, rir: 2 }]).action, "maintain");
  assert.equal(nextSessionLoad([{ weight: 40, reps: 5, rir: 1 }, { weight: 40, reps: 6, rir: 1 }, { weight: 40, reps: 6, rir: 1 }], { repLower: 6, currentLoad: 40, equipment: "바벨", loadSteps: [1.25] }).nextLoad, 37.5);
  assert.equal(nextSessionLoad([{ weight: 40, reps: 12, rir: 0 }, { weight: 40, reps: 12, rir: 2 }, { weight: 40, reps: 12, rir: 2 }], { repLower: 6 }).action, "maintain");
  assert.equal(availableNextLoad(10, { equipment: "덤벨", loadSteps: [1, 2.5] }), 11);
  assert.equal(availableNextLoad(22.5, { availableLoads: [7.5, 15, 22.5], loadSteps: [2.5] }), null);
  assert.equal(availablePreviousLoad(7.5, { availableLoads: [7.5, 15, 22.5], loadSteps: [2.5] }), null);
  assert.equal(availablePreviousLoad(20, { equipment: "바벨", exerciseId: "bench", loadSteps: [1.25] }), 20);
  assert.equal(availableNextLoad(30, { equipment: "머신", exerciseId: "low_row", loadBasis: "per_side", loadSteps: [5] }), 35);
  assert.equal(availableNextLoad(40, { equipment: "머신", exerciseId: "assisted_pullup", loadBasis: "assistance", loadSteps: [5] }), 35);
  assert.equal(availablePreviousLoad(40, { equipment: "머신", exerciseId: "assisted_pullup", loadBasis: "assistance", loadSteps: [5] }), 45);
  assert.equal(availableNextLoad(40, { availableLoads: [20, 30, 40, 50], loadBasis: "assistance" }), 30);
  assert.equal(availablePreviousLoad(40, { availableLoads: [20, 30, 40, 50], loadBasis: "assistance" }), 50);
  assert.equal(nextSessionLoad([{ weight: 40, reps: 12, rir: 2 }, { weight: 40, reps: 12, rir: 2 }, { weight: 40, reps: 12, rir: 2 }], { currentLoad: 40, repUpper: 12, loadBasis: "assistance", loadSteps: [5] }).nextLoad, 35);
  assert.equal(loadBasisForExercise({ equipment: "덤벨" }), "per_hand");
  assert.equal(loadBasisForExercise({ equipment: "바벨" }), "total");
});

test("워밍업 기록은 본세트 진행과 증량 판정에 포함하지 않는다", () => {
  const plan = normalizePlan({ split: "ppl" }, { ...intake, preferences: "PPL" });
  const session = makeSession(plan, [], "2026-09-27", "PUSH", gym);
  const exercise = { ...session.exercises[0], completedWarmups: [{ reps: 15 }, { reps: 10 }], completedSets: [] };
  assert.equal(exercise.completedWarmups.length, 2);
  assert.equal(exercise.completedSets.length, 0);
  assert.equal(nextSessionLoad(exercise.completedSets, { targetSets: exercise.sets }).action, "maintain");
});

test("운동 종류별 맨몸 몸풀기는 실제 동작 순서와 목적을 제공한다", () => {
  const push = generalWarmupForType("PUSH");
  assert.equal(push.exercises.length, 7);
  assert.ok(push.exercises.some((item) => item.includes("스캡 푸시업")));
  assert.ok(push.exercises.some((item) => item.includes("손목 돌리기")));
  assert.match(push.goal, /어깨와 견갑/);
  assert.notDeepEqual(generalWarmupForType("PULL").exercises, push.exercises);
  assert.notDeepEqual(generalWarmupForType("LEGS").exercises, push.exercises);
});

test("전체 운동 타이머는 실행 구간만 누적하고 오래된 startedAt은 무시한다", () => {
  const started = Date.parse("2026-09-28T10:00:00.000Z");
  const resumed = resumeSessionTimer({ elapsedSeconds: 120, startedAt: "2026-09-27T00:00:00.000Z" }, started);
  assert.equal(sessionElapsedSeconds(resumed, started + 65_000), 185);
  const paused = pauseSessionTimer(resumed, started + 65_000);
  assert.equal(paused.elapsedSeconds, 185);
  assert.equal(paused.activeStartedAt, null);
  assert.equal(sessionElapsedSeconds(paused, started + 8 * 60 * 60 * 1000), 185);
  assert.equal(sessionElapsedSeconds({ startedAt: "2026-09-01T00:00:00.000Z" }, started), 0);
});

test("종목 교체는 같은 부위와 등 운동의 동일 당기기 패턴만 보여준다", () => {
  const barbellRow = EXERCISES.find((item) => item.id === "barbell_row");
  const rowOptions = replacementOptions(barbellRow, EXERCISES, [barbellRow]).map((item) => item.id);
  assert.ok(rowOptions.includes("low_row"));
  assert.ok(rowOptions.includes("four_way_row"));
  assert.ok(rowOptions.includes("cable_row"));
  assert.equal(rowOptions.includes("lat_pulldown"), false);

  const bench = EXERCISES.find((item) => item.id === "bench");
  const chestOptions = replacementOptions(bench, EXERCISES, [bench]);
  assert.ok(chestOptions.length > 0);
  assert.ok(chestOptions.every((item) => item.target === "가슴" && item.pattern === "horizontal_press"));
});

test("기존 대화에서 사용한 부위별 운동과 머신 대체 종목을 제공한다", () => {
  const required = ["chest_press", "incline_hammer_press", "ohp", "cable_rear_delt", "triceps", "assisted_pullup", "tbar_row", "high_row", "low_row", "four_way_row", "straight_arm_pulldown", "pullover_machine", "leg_press", "leg_curl", "hip_abductor", "plank"];
  assert.deepEqual(required.filter((id) => !EXERCISES.some((item) => item.id === id)), []);
});

test("동일 효과의 기구가 있으면 머신 우선 선호를 운동 구성에 반영한다", () => {
  const place = normalizeLocationEquipment({ equipment: ["맨몸", "벤치", "바벨", "덤벨", "케이블 머신", "체스트프레스 머신", "숄더 프레스 머신"] });
  const context = { ...gym, equipment: place.equipment, equipmentItems: place.equipmentItems };
  const machinePlan = normalizePlan({ split: "ppl" }, { ...intake, preferences: "PPL 후 휴식", preferMachinesWhenEquivalent: true });
  const freePlan = normalizePlan({ split: "ppl" }, { ...intake, preferences: "PPL 후 휴식", preferMachinesWhenEquivalent: false });
  const machinePush = makeSession(machinePlan, [], "2026-09-28", "PUSH", context);
  const freePush = makeSession(freePlan, [], "2026-09-28", "PUSH", context);
  assert.equal(machinePush.exercises.find((item) => item.target === "가슴").equipment, "머신");
  assert.ok(machinePush.exercises.some((item) => item.pattern === "lateral_raise"));
  assert.equal(freePush.exercises.find((item) => item.target === "가슴").id, "bench");
});

test("프로필의 선호 종목과 피할 종목은 새 운동 구성에 반영되고 계획 버전은 유지된다", () => {
  const place = normalizeLocationEquipment({ equipment: ["맨몸", "인클라인 해머프레스 머신", "숄더 프레스 머신", "케이블 머신", "바벨", "덤벨", "벤치"] });
  const context = { ...gym, equipment: place.equipment, equipmentItems: place.equipmentItems };
  const updated = normalizePlan(
    { split: "ppl", version: 7 },
    { ...intake, preferences: "PPL로 하고 가슴은 인클라인 해머 프레스를 선호", avoid: "벤치 프레스와 바벨 로우는 피하고 싶음", preferMachinesWhenEquivalent: true },
  );
  assert.equal(updated.version, 7);
  assert.ok(updated.preferredExerciseIds.includes("incline_hammer_press"));
  assert.ok(updated.excludedExerciseIds.includes("bench"));
  assert.ok(updated.excludedExerciseIds.includes("barbell_row"));
  const push = makeSession(updated, [], "2026-09-28", "PUSH", context);
  assert.equal(push.planVersion, 7);
  assert.equal(push.exercises.some((item) => item.id === "bench"), false);
  assert.ok(push.exercises.some((item) => item.id === "incline_hammer_press"));
});

test("안전 주의사항에 나온 기구명은 제외하지 않고 명시적으로 피한 종목만 제외한다", () => {
  const safetyNotes = [
    "다른 머신끼리 kg 숫자를 직접 비교하지 않기",
    "레그프레스는 골반이 말리기 전까지만 내리기",
    "인클라인 프레스에서 통증이 생기면 즉시 중단",
  ].join("\n");
  const safePlan = normalizePlan({ split: "ppl" }, { ...intake, preferences: "PPL 후 휴식", avoid: safetyNotes });
  assert.deepEqual(safePlan.excludedExerciseIds, []);

  const explicitPlan = normalizePlan(
    { split: "ppl" },
    { ...intake, preferences: "PPL 후 휴식", avoid: `${safetyNotes}\n벤치 프레스와 바벨 로우는 피하고 싶음` },
  );
  assert.ok(explicitPlan.excludedExerciseIds.includes("bench"));
  assert.ok(explicitPlan.excludedExerciseIds.includes("barbell_row"));
  assert.equal(explicitPlan.excludedExerciseIds.includes("leg_press"), false);
  assert.equal(explicitPlan.excludedExerciseIds.includes("incline_hammer_press"), false);
});

test("실제 프로필의 랫풀다운과 등 머신 선호를 PULL 추천에 그대로 반영한다", () => {
  const preferences = [
    "PPL 방식으로 PUSH, PULL, LEGS 뒤 하루 휴식하는 4주기형으로 하고 싶음.",
    "PULL에는 랫 풀다운을 항상 포함하고 4-Way Row, T바 로우, 하이 로우, 프론트 로우 머신, 시티드 로우 머신, 풀오버 머신을 번갈아 하고 싶음.",
    "단순 플랭크만 하기보다 케이블 크런치를 우선하고 싶음.",
  ].join("\n");
  const avoid = "다른 머신끼리 kg 숫자를 직접 비교하지 않기\n레그프레스는 골반이 말리기 전까지만 내리기\n인클라인 프레스에서 통증이 생기면 즉시 중단";
  const place = normalizeLocationEquipment({
    equipment: ["맨몸", "덤벨", "케이블 머신", "랫풀다운 머신", "4-Way Row 머신", "T바 로우", "하이 로우 머신", "프론트 로우 머신", "시티드 로우 머신", "풀오버 머신"],
  });
  const plan = normalizePlan({ split: "ppl", version: 5 }, { ...intake, preferences, avoid, preferMachinesWhenEquivalent: true });
  assert.ok(plan.preferredExerciseIds.includes("lat_pulldown"));
  assert.ok(plan.preferredExerciseIds.includes("four_way_row"));
  assert.ok(plan.preferredExerciseIds.includes("pullover_machine"));
  assert.ok(plan.preferredExerciseIds.includes("cable_crunch"));
  assert.equal(plan.preferredExerciseIds.includes("plank"), false);
  assert.deepEqual(plan.excludedExerciseIds, []);

  const session = makeSession(plan, [], "2026-09-28", "PULL", { ...gym, equipment: place.equipment, equipmentItems: place.equipmentItems });
  const backIds = session.exercises.filter((item) => item.kind === "back").map((item) => item.id);
  assert.equal(backIds[0], "lat_pulldown");
  assert.ok(backIds.slice(1).every((id) => ["four_way_row", "tbar_row", "high_row", "front_row_machine", "seated_row_machine", "seated_row_machine_wide", "four_way_row_wide", "pullover_machine"].includes(id)));
  assert.equal(backIds.includes("superman"), false);
  assert.equal(backIds.includes("db_row"), false);
});

test("프로필의 PULL 전완과 PUSH 후면·측면 어깨 구성을 실제 종목에 반영한다", () => {
  const preferences = [
    "가슴 삼두 어깨 -> 등 이두 전완 -> 하체 복근 -> 휴식",
    "PULL 날에는 랫풀다운을 항상 포함한다.",
    "PUSH 날 후면어깨 운동을 항상 포함하고 측면 삼각근도 높은 우선순위로 훈련한다.",
  ].join("\n");
  const place = normalizeLocationEquipment({ equipment: ["맨몸", "덤벨", "케이블 머신", "랫풀다운 머신", "4-Way Row 머신", "하이 로우 머신", "풀오버 머신", "체스트프레스 머신", "인클라인 해머프레스 머신", "리버스 펙덱"] });
  const context = { ...gym, equipment: place.equipment, equipmentItems: place.equipmentItems };
  const plan = normalizePlan({ split: "ppl", version: 8 }, { ...intake, preferences, preferMachinesWhenEquivalent: true });
  assert.equal(plan.pullForearms, true);
  assert.equal(plan.pushRearDeltRequired, true);
  assert.equal(plan.pushLateralDeltPriority, true);
  assert.deepEqual(plan.sessionContracts.find((item) => item.label === "PULL").requiredGroups, ["등", "이두", "전완"]);

  const pull = makeSession(plan, [], "2026-09-28", "PULL", context);
  assert.equal(pull.exercises.filter((item) => item.kind === "biceps").length, 1);
  assert.equal(pull.exercises.filter((item) => item.kind === "forearms").length, 1);
  assert.ok(pull.exercises.some((item) => item.target === "전완"));

  const push = makeSession(plan, [], "2026-09-28", "PUSH", context);
  assert.ok(push.exercises.some((item) => item.pattern === "rear_delt"));
  assert.ok(push.exercises.some((item) => item.pattern === "lateral_raise"));
});

test("유산소 기본값은 PUSH/PULL/LEGS 별로 다르고 피로·시간이 부족하면 축소한다", () => {
  assert.equal(cardioRecommendation("PUSH").label, "빠른 러닝머신 250m × 4");
  assert.equal(cardioRecommendation("PULL").mode, "easy");
  assert.equal(cardioRecommendation("LEGS").mode, "none");
  assert.equal(cardioRecommendation("PUSH", { fatigue: 5, remainingMinutes: 5 }).mode, "none");
});

test("PPL 계약은 PUSH 가슴·삼두·어깨, PULL 등·이두, LEGS 하체·복근을 섞지 않는다", () => {
  const plan = normalizePlan({ split: "ppl", restAfterCycle: false }, { ...intake, preferences: "PPL" });
  assert.deepEqual(plan.sessionContracts.map((item) => item.label), ["PUSH", "PULL", "LEGS", "REST"]);
  assert.equal(plan.restAfterCycle, true);
  const push = makeSession(plan, [], "2026-09-27", "PUSH", gym);
  const pull = makeSession(plan, [], "2026-09-27", "PULL", gym);
  const legs = makeSession(plan, [], "2026-09-27", "LEGS", gym);
  assert.ok(push.exercises.every((item) => ["가슴", "삼두", "어깨"].includes(item.target)));
  assert.ok(pull.exercises.every((item) => ["등", "광배", "이두"].includes(item.target)));
  assert.ok(legs.exercises.every((item) => ["하체", "뒤 허벅지", "종아리", "코어"].includes(item.target)));
  const shortPush = makeSession(plan, [], "2026-09-27", "PUSH", { ...gym, durationMinutes: 30 });
  assert.ok(["가슴", "삼두", "어깨"].every((target) => shortPush.exercises.some((item) => item.target === target)));
});

test("장소 기구 다대다 정규화가 덤벨 별칭과 중량 단계를 저장하고 후보에 반영한다", () => {
  const place = normalizeLocationEquipment({ equipment: ["조절식 덤벨", "인클라인 벤치"], equipmentItems: [{ id: "dumbbell", loadSteps: [1.5], availableLoads: [7.5, 15], loadBasis: "per_hand", instanceId: "home-db" }] });
  const adjustableDumbbell = place.equipmentItems.find((item) => item.id === "dumbbell");
  assert.deepEqual(adjustableDumbbell.loadSteps, [1.5]);
  assert.deepEqual(adjustableDumbbell.availableLoads, [7.5, 15]);
  assert.equal(adjustableDumbbell.loadBasis, "per_hand");
  assert.equal(adjustableDumbbell.instanceId, "home-db");
  const session = makeSession(normalizePlan({ split: "ppl" }, { ...intake, preferences: "PPL" }), [], "2026-09-27", "PUSH", { ...gym, equipment: [], ...place });
  assert.ok(session.exercises.some((item) => item.id === "db_press"));
});

test("각 기구는 허용 운동 목록을 저장하고 특정 머신 이름이 다른 머신 운동을 열지 않는다", () => {
  assert.ok(EQUIPMENT_CATALOG.every((item) => Array.isArray(item.exerciseIds)));
  const place = normalizeLocationEquipment({ equipment: ["맨몸", "체스트프레스 머신"] });
  assert.ok(place.equipmentItems.some((item) => item.id === "chest_press_machine" && item.exerciseIds.includes("chest_press")));
  assert.equal(place.equipmentItems.some((item) => item.id === "machine"), false);
  const ids = availableExercises({ ...gym, equipment: place.equipment, equipmentItems: place.equipmentItems }, localPlan(intake)).map((item) => item.id);
  assert.ok(ids.includes("chest_press"));
  assert.equal(ids.includes("leg_press"), false);
  assert.equal(ids.includes("machine_shoulder_press"), false);
});

test("등록한 등 머신이 있으면 슈퍼맨과 원암 덤벨 로우보다 해당 머신을 먼저 구성한다", () => {
  const place = normalizeLocationEquipment({ equipment: ["맨몸", "덤벨", "케이블 머신", "랫풀다운 머신", "4-Way Row 머신", "하이로우 머신", "풀오버 머신"] });
  const plan = normalizePlan({ split: "ppl" }, { ...intake, preferences: "PPL, 등 운동은 매번 다르게", preferMachinesWhenEquivalent: true });
  const session = makeSession(plan, [], "2026-09-28", "PULL", { ...gym, equipment: place.equipment, equipmentItems: place.equipmentItems });
  const backIds = session.exercises.filter((item) => item.kind === "back").map((item) => item.id);
  assert.deepEqual(backIds, ["lat_pulldown", "four_way_row", "high_row", "pullover_machine"]);
  assert.equal(backIds.includes("superman"), false);
  assert.equal(backIds.includes("db_row"), false);
});

test("이전 플라이 기록이 있어도 PUSH의 첫 운동은 주요 프레스를 유지한다", () => {
  const place = normalizeLocationEquipment({ equipment: ["맨몸", "덤벨", "벤치", "케이블 머신"] });
  const plan = normalizePlan({ split: "ppl" }, { ...intake, preferences: "PPL", preferMachinesWhenEquivalent: false });
  const history = [{ status: "complete", label: "PUSH", exercises: [{ id: "cable_fly", completedSets: [{}, {}, {}] }] }];
  const session = makeSession(plan, history, "2026-09-28", "PUSH", { ...gym, equipment: place.equipment, equipmentItems: place.equipmentItems });
  assert.equal(session.exercises.find((item) => item.target === "가슴").pattern, "horizontal_press");
});

test("기록 입력 분류는 낮은 확신을 확인 대기로 두고 워밍업 생략 판단은 이전 프레스를 본다", () => {
  assert.equal(classifyWorkoutInput("잘 모르겠어요").requiresConfirmation, true);
  assert.equal(classifyWorkoutInput("기구가 사용 중이라 다른 운동으로 바꿔줘").intent, "equipment_unavailable");
  const plan = normalizePlan({ split: "ppl" }, { ...intake, preferences: "PPL" });
  const push = makeSession(plan, [], "2026-09-27", "PUSH", gym);
  const triceps = push.exercises.find((item) => item.id === "triceps");
  assert.equal(warmupDecision(triceps, [{ muscles: ["chest"], joints: ["shoulder", "elbow"], completedSets: [{ reps: 8 }] }]).mode, "check");
});

test("한국어 채팅식 중량·반복 입력과 전체 운동 진행률을 계산한다", () => {
  assert.deepEqual(classifyWorkoutInput("40키로 11개 함").setRecord, { reps: 11, weight: 40, durationSeconds: null });
  assert.deepEqual(classifyWorkoutInput("17.5키로 10개 함").setRecord, { reps: 10, weight: 17.5, durationSeconds: null });
  assert.deepEqual(classifyWorkoutInput("7,5kg 20회").setRecord, { reps: 20, weight: 7.5, durationSeconds: null });
  assert.deepEqual(classifyWorkoutInput("빈봉 10개", { id: "bench" }).setRecord, { reps: 10, weight: 20, durationSeconds: null });
  assert.deepEqual(classifyWorkoutInput("빈봉 10개", { id: "barbell_row" }).setRecord, { reps: 10, weight: null, durationSeconds: null });
  assert.deepEqual(classifyWorkoutInput("빈봉", { id: "squat" }).setRecord, { reps: null, weight: 20, durationSeconds: null });
  assert.equal(classifyWorkoutInput("0kg 8회").setRecord.weight, 0);
  assert.deepEqual(classifyWorkoutInput("중량 올려줘").requestedLoadChange, { weight: null, explicit: false });
  assert.equal(classifyWorkoutInput("45kg로 올려줘").setRecord, null);
  assert.equal(classifyWorkoutInput("내려줘").intent, "load_change");
  const plan = normalizePlan({ split: "ppl" }, { ...intake, preferences: "PPL" });
  const session = makeSession(plan, [], "2026-09-27", "PUSH", gym);
  session.generalWarmup.completed = true;
  session.exercises[0].completedWarmups = [{ reps: 10 }];
  session.exercises[0].completedSets = [{ reps: 8, weight: 40 }];
  const progress = workoutProgress(session);
  assert.ok(progress.total > progress.completed);
  assert.equal(progress.completed, 3);
  assert.ok(exerciseWarmupTarget(session.exercises[0], []) >= 1);
  assert.deepEqual(workoutFlowGroups(session).map((group) => group.label), [...new Set(session.exercises.map((item) => item.target))]);
});

test("세트 메모의 통증·폼·자극·난이도가 다음 행동 판단에 반영된다", () => {
  assert.deepEqual(setFeedbackFromText("팔꿈치가 아프고 찝혀요").status, "pain");
  assert.deepEqual(setFeedbackFromText("폼이 무너지고 자세가 불안함").status, "form_breakdown");
  assert.deepEqual(setFeedbackFromText("등 자극이 안 와요").status, "target_missed");
  assert.deepEqual(setFeedbackFromText("너무 무거워서 반복을 못 함").status, "too_heavy");
  assert.equal(evaluateSet({ ...setFeedbackFromText("팔꿈치 통증"), status: "pain" }).action, "replace_exercise");
});

test("이전 완료 기록을 새 운동의 추천 중량·횟수 기본값으로 사용한다", () => {
  const exercise = EXERCISES.find((item) => item.id === "cable_curl");
  const history = [{ date: "2026-09-20", exercises: [{ id: "cable_curl", completedSets: [{ weight: 17.5, reps: 12, rir: 2 }] }] }];
  assert.deepEqual(recommendedSetInput(exercise, history), { weight: 17.5, reps: 12, source: "history" });
  assert.deepEqual(recommendedSetInput(exercise, history, { phase: "warmup", warmupIndex: 0 }), { weight: 7.5, reps: 12, source: "history_warmup" });
  const bench = EXERCISES.find((item) => item.id === "bench");
  const completed = [{ id: "bench", sets: 3, completedSets: [1, 2, 3].map(() => ({ weight: 40, reps: 10, rir: 1 })) }];
  assert.deepEqual(recommendedSetInput(bench, [{ date: "2026-09-20", exercises: completed }]), { weight: 42.5, reps: 6, source: "history_progression", loadAdjustment: "increase_load" });
});

test("첫 본세트 추천은 같은 장소와 정확한 운동 변형의 실제 세트만 쓴다", () => {
  const exercise = EXERCISES.find((item) => item.id === "low_row_wide");
  const history = [
    { date: "2026-09-21", context: { locationId: "home" }, exercises: [{ id: exercise.id, completedSets: [{ weight: 22, reps: 11 }] }] },
    { date: "2026-09-25", context: { locationId: "gym" }, exercises: [{ id: exercise.id, completedSets: [{ weight: 40, reps: 8 }, { weight: 45, reps: 6 }] }] },
    { date: "2026-09-26", context: { locationId: "gym" }, exercises: [{ id: "low_row", completedSets: [{ weight: 55, reps: 10 }] }] },
  ];
  assert.deepEqual(recommendedSetInput(exercise, history, { locationId: "gym" }), { weight: 45, reps: 6, source: "history" });
  assert.deepEqual(recommendedSetInput(exercise, history, { locationId: "other" }), { weight: 0, reps: 8, source: "target", needsInitialLoad: true });
  const withFuture = [...history, { date: "2026-09-30", context: { locationId: "gym" }, exercises: [{ id: exercise.id, completedSets: [{ weight: 80, reps: 12 }] }] }];
  assert.equal(recommendedSetInput(exercise, withFuture, { locationId: "gym", date: "2026-09-28" }).weight, 45);
});

test("중량을 낮춘 운동 다음에는 마지막 정상 본세트를 기준으로 하고 혼합 중량은 증량하지 않는다", () => {
  const exercise = EXERCISES.find((item) => item.id === "bench");
  const history = [{ date: "2026-09-27", exercises: [{ ...exercise, sets: 3, completedSets: [
    { weight: 40, reps: 6, rir: 1 },
    { weight: 35, reps: 8, rir: 2 },
    { weight: 35, reps: 10, rir: 2 },
    { weight: 40, reps: 2, rir: 0, status: "pain" },
  ] }] }];
  assert.deepEqual(recommendedSetInput(exercise, history), { weight: 35, reps: 10, source: "history" });
});

test("중량 추천은 등록 기구 변형과 기록 기준을 비교하고 워밍업은 가능한 무게를 쓴다", () => {
  const exercise = EXERCISES.find((item) => item.id === "low_row_wide");
  const context = { locationId: "gym", equipmentItems: [{ id: "low_row_machine", variants: ["plate loaded A"], exerciseIds: [exercise.id], loadBasis: "per_side", availableLoads: [10, 20, 30], loadSteps: [5] }] };
  const prior = [{ date: "2026-09-27", context, exercises: [{ ...exercise, completedSets: [{ weight: 20, reps: 12 }] }] }];
  assert.equal(equipmentKeyForExercise(exercise, context), "low_row_machine::plate loaded A");
  assert.equal(recommendedSetInput(exercise, prior, { context }).weight, 20);
  const changed = { ...context, equipmentItems: [{ ...context.equipmentItems[0], variants: ["plate loaded B"] }] };
  assert.equal(recommendedSetInput(exercise, prior, { context: changed }).source, "target");

  const bench = EXERCISES.find((item) => item.id === "bench");
  const history = [{ date: "2026-09-27", exercises: [{ ...bench, sets: 3, completedSets: [{ weight: 47.5, reps: 8 }] }] }];
  assert.equal(recommendedSetInput(bench, history, { phase: "warmup", warmupIndex: 0 }).weight, 22.5);
  assert.equal(recommendedSetInput(bench, history, { phase: "warmup", warmupIndex: 1 }).weight, 35);
});

test("어시스트 풀업은 보조 중량 방향으로 진행하고 시작 중량은 근거 없으면 직접 입력을 요청한다", () => {
  const exercise = EXERCISES.find((item) => item.id === "assisted_pullup");
  const equipment = { id: "assisted_pullup", exerciseIds: ["assisted_pullup", "assisted_chinup"], loadBasis: "total", loadSteps: [5], availableLoads: [20, 30, 40, 50] };
  assert.equal(loadBasisForExercise(exercise, { equipmentItems: [equipment] }), "assistance");
  const start = recommendedSetInput(exercise, [], { context: { locationId: "gym", equipmentItems: [equipment] }, locationId: "gym" });
  assert.equal(start.weight, 50);
  assert.equal(start.source, "equipment_starting_point");
  const unknown = recommendedSetInput(exercise, [], { context: { locationId: "gym", equipmentItems: [{ ...equipment, availableLoads: [] }] }, locationId: "gym" });
  assert.equal(unknown.weight, 0);
  assert.equal(unknown.needsInitialLoad, true);
  const history = [{ date: "2026-09-20", context: { locationId: "gym", equipmentItems: [equipment] }, exercises: [{ ...exercise, loadBasis: "assistance", targetSets: 3, completedSets: [{ weight: 40, reps: 12, rir: 2 }, { weight: 40, reps: 12, rir: 2 }, { weight: 40, reps: 12, rir: 2 }] }] }];
  const next = recommendedSetInput(exercise, history, { context: { locationId: "gym", equipmentItems: [equipment] }, locationId: "gym" });
  assert.equal(next.weight, 30);
  assert.equal(next.needsInitialLoad, undefined);
  const migratedDraftHistory = [{ ...history[0], exercises: [{ ...history[0].exercises[0], loadBasis: "total", completedSets: history[0].exercises[0].completedSets.map((set) => ({ ...set, loadBasis: "assistance" })) }] }];
  assert.equal(recommendedSetInput(exercise, migratedDraftHistory, { context: { locationId: "gym", equipmentItems: [equipment] }, locationId: "gym" }).weight, 30);
  const warmup = recommendedSetInput(exercise, history, { phase: "warmup", context: { locationId: "gym", equipmentItems: [equipment] }, locationId: "gym" });
  assert.equal(warmup.weight, 40);
  assert.ok(warmup.weight >= next.weight);
  const zeroAssistanceHistory = [{ date: "2026-09-21", context: { locationId: "gym", equipmentItems: [equipment] }, exercises: [{ ...exercise, loadBasis: "assistance", targetSets: 3, completedSets: [{ weight: 0, reps: 8, rir: 2, loadBasis: "assistance" }] }] }];
  const zeroWarmup = recommendedSetInput(exercise, zeroAssistanceHistory, { phase: "warmup", context: { locationId: "gym", equipmentItems: [equipment] }, locationId: "gym" });
  assert.equal(zeroWarmup.weight, 30);
  const spacedEquipment = { ...equipment, availableLoads: [20, 40, 45, 50, 55, 60] };
  const steadyHistory = [{ date: "2026-09-20", context: { locationId: "gym", equipmentItems: [spacedEquipment] }, exercises: [{ ...exercise, loadBasis: "assistance", targetSets: 3, completedSets: [{ weight: 40, reps: 8, rir: 2, loadBasis: "assistance" }] }] }];
  assert.equal(recommendedSetInput(exercise, steadyHistory, { phase: "warmup", context: { locationId: "gym", equipmentItems: [spacedEquipment] }, locationId: "gym", warmupIndex: 0 }).weight, 50);
  assert.equal(recommendedSetInput(exercise, steadyHistory, { phase: "warmup", context: { locationId: "gym", equipmentItems: [spacedEquipment] }, locationId: "gym", warmupIndex: 1 }).weight, 45);
  const sparseEquipment = { ...equipment, availableLoads: [20, 40, 60] };
  const sparseHistory = [{ ...steadyHistory[0], context: { locationId: "gym", equipmentItems: [sparseEquipment] } }];
  assert.equal(recommendedSetInput(exercise, sparseHistory, { phase: "warmup", context: { locationId: "gym", equipmentItems: [sparseEquipment] }, locationId: "gym" }).weight, 60);
  const noLoadData = { ...equipment, availableLoads: [], loadSteps: [] };
  const unsupportedHistory = [{ ...steadyHistory[0], context: { locationId: "gym", equipmentItems: [noLoadData] } }];
  assert.equal(recommendedSetInput(exercise, unsupportedHistory, { phase: "warmup", context: { locationId: "gym", equipmentItems: [noLoadData] }, locationId: "gym" }).weight, 40);
  const legacy = [{ ...history[0], exercises: [{ ...history[0].exercises[0], loadBasis: "total" }] }];
  assert.equal(recommendedSetInput(exercise, legacy, { context: { locationId: "gym", equipmentItems: [equipment] }, locationId: "gym" }).source, "equipment_starting_point");
});

test("이두와 측면 어깨의 케이블 종목에서 덤벨 대체 종목을 표시한다", () => {
  const cableCurl = EXERCISES.find((item) => item.id === "cable_curl");
  const cableLateral = EXERCISES.find((item) => item.id === "cable_lateral_raise");
  assert.ok(replacementOptions(cableCurl, EXERCISES, [cableCurl]).some((item) => item.id === "curl"));
  assert.ok(replacementOptions(cableLateral, EXERCISES, [cableLateral]).some((item) => item.id === "lateral_raise"));
});

test("주 사용근과 보조근의 앞선 세트량으로 뒤쪽 종목 세트를 일반 조절한다", () => {
  const chestPress = { ...EXERCISES.find((item) => item.id === "chest_press"), sets: 3 };
  const incline = { ...EXERCISES.find((item) => item.id === "incline_hammer_press"), sets: 3 };
  const triceps = EXERCISES.find((item) => item.id === "triceps");
  const tricepsPlan = volumeAdjustedSets(triceps, [chestPress, incline]);
  assert.equal(tricepsPlan.sets, 2);
  assert.equal(tricepsPlan.exposure, 3);

  const squat = { ...EXERCISES.find((item) => item.id === "squat"), sets: 3 };
  const rdl = { ...EXERCISES.find((item) => item.id === "rdl"), sets: 3 };
  const legCurl = EXERCISES.find((item) => item.id === "leg_curl");
  assert.equal(volumeAdjustedSets(legCurl, [squat, rdl]).sets, 2);

  const place = normalizeLocationEquipment({ equipment: ["맨몸", "덤벨", "케이블 머신", "랫풀다운 머신", "4-Way Row 머신", "하이 로우 머신", "풀오버 머신"] });
  const plan = normalizePlan({ split: "ppl" }, { ...intake, preferences: "PPL 등 이두 전완 후 휴식" });
  const pull = makeSession(plan, [], "2026-09-28", "PULL", { ...gym, equipment: place.equipment, equipmentItems: place.equipmentItems });
  assert.ok(pull.exercises.filter((item) => ["biceps", "forearms"].includes(item.kind)).every((item) => item.sets === 2));
  const curlIndex = pull.exercises.findIndex((item) => item.kind === "biceps");
  const replaced = replaceExercise(pull, curlIndex, "hammer_curl");
  assert.equal(replaced.exercises[curlIndex].sets, 2);
});

test("프론·시티드 레그 컬은 장소 기구와 기록을 나누고 구형 레그 컬 설정은 유지한다", () => {
  const plan = localPlan(intake);
  const idsAt = (names) => {
    const place = normalizeLocationEquipment({ equipment: names });
    return availableExercises({ ...gym, equipment: place.equipment, equipmentItems: place.equipmentItems }, plan).map((item) => item.id);
  };
  const proneIds = idsAt(["프론 레그컬 머신"]);
  const seatedIds = idsAt(["시티드 레그 컬 머신"]);
  const bothIds = idsAt(["프론 레그 컬 머신", "시티드 레그 컬 머신"]);
  assert.ok(proneIds.includes("prone_leg_curl"));
  assert.equal(proneIds.includes("seated_leg_curl"), false);
  assert.equal(proneIds.includes("leg_curl"), false);
  assert.ok(seatedIds.includes("seated_leg_curl"));
  assert.equal(seatedIds.includes("prone_leg_curl"), false);
  assert.equal(seatedIds.includes("leg_curl"), false);
  assert.ok(bothIds.includes("prone_leg_curl") && bothIds.includes("seated_leg_curl"));

  const legacyPlace = normalizeLocationEquipment({ equipment: ["레그 컬 머신"] });
  const legacyPool = availableExercises({ ...gym, equipment: legacyPlace.equipment, equipmentItems: legacyPlace.equipmentItems }, plan);
  assert.ok(legacyPool.some((item) => item.id === "leg_curl"));
  assert.equal(legacyPool.some((item) => item.id === "prone_leg_curl" || item.id === "seated_leg_curl"), false);
  assert.equal(idsAt(["머신"]).some((id) => ["leg_curl", "prone_leg_curl", "seated_leg_curl"].includes(id)), false);

  const prone = EXERCISES.find((item) => item.id === "prone_leg_curl");
  const seated = EXERCISES.find((item) => item.id === "seated_leg_curl");
  const proneContext = { locationId: "gym", equipmentItems: [{ id: "prone_leg_curl", instanceId: "prone-1", variants: ["프론 레그 컬 머신"], availableLoads: [10, 20, 30] }] };
  const seatedContext = { locationId: "gym", equipmentItems: [{ id: "seated_leg_curl", instanceId: "seated-1", variants: ["시티드 레그 컬 머신"], availableLoads: [10, 20, 30] }] };
  assert.notEqual(equipmentKeyForExercise(prone, proneContext), equipmentKeyForExercise(seated, seatedContext));
  const history = [
    { date: "2026-10-01", context: proneContext, exercises: [{ ...prone, completedSets: [{ weight: 25, reps: 12 }] }] },
    { date: "2026-10-02", context: seatedContext, exercises: [{ ...seated, completedSets: [{ weight: 40, reps: 12 }] }] },
  ];
  assert.equal(recommendedSetInput(prone, history, { context: proneContext }).weight, 25);
  assert.equal(recommendedSetInput(seated, history, { context: seatedContext }).weight, 40);
  assert.ok(replacementOptions(prone, [prone, seated], [prone]).some((item) => item.id === "seated_leg_curl"));
  assert.deepEqual(localPlan({ ...intake, preferences: "프론 레그컬 선호" }).preferredExerciseIds, ["prone_leg_curl"]);
  assert.deepEqual(localPlan({ ...intake, preferences: "시티드 레그 컬 선호" }).preferredExerciseIds, ["seated_leg_curl"]);
});

test("머신 힙 쓰러스트는 아웃타이 기본을 유지하면서 기구가 있을 때만 대체로 제공한다", () => {
  const plan = normalizePlan({ split: "ppl" }, intake);
  const absent = normalizeLocationEquipment({ equipment: ["아웃타이 머신"] });
  const absentContext = { ...gym, equipment: absent.equipment, equipmentItems: absent.equipmentItems };
  const absentPool = availableExercises(absentContext, plan);
  const abductor = absentPool.find((item) => item.id === "hip_abductor");
  assert.equal(absentPool.some((item) => item.id === "machine_hip_thrust"), false);

  const equipped = normalizeLocationEquipment({ equipment: ["아웃타이 머신", "글루트 드라이브 머신"] });
  const context = { ...gym, equipment: equipped.equipment, equipmentItems: equipped.equipmentItems };
  const pool = availableExercises(context, plan);
  const hipThrust = pool.find((item) => item.id === "machine_hip_thrust");
  const legs = makeSession(plan, [], "2026-10-10", "LEGS", context);
  assert.ok(hipThrust);
  assert.equal(legs.exercises.find((item) => item.pattern === "hip_abduction")?.id, "hip_abductor");
  assert.ok(replacementOptions(abductor, pool, [abductor]).some((item) => item.id === "machine_hip_thrust"));
  assert.equal(hipThrust.pattern, "glute_extension");
  assert.deepEqual(hipThrust.muscles, ["glutes"]);
  assert.equal(hipThrust.target, "둔근");

  const history = [{ date: "2026-10-01", context, exercises: [{ ...hipThrust, completedSets: [{ weight: 60, reps: 10 }] }] }];
  assert.equal(recommendedSetInput(hipThrust, history, { context }).weight, 60);
  assert.equal(recommendedSetInput(EXERCISES.find((item) => item.id === "hip_abductor"), history, { context }).source, "target");
});

test("스쿼트 머신 카프 레이즈는 양쪽 추가 원판 합계로 기록하고 맨몸 종목 기록과 분리한다", () => {
  const plan = normalizePlan({ split: "ppl" }, intake);
  const weighted = EXERCISES.find((item) => item.id === "squat_machine_calf_raise");
  const bodyweight = EXERCISES.find((item) => item.id === "calf_raise");
  assert.equal(weighted.measurement, "reps_weight");
  assert.equal(weighted.loadBasis, "total");
  assert.equal(weighted.loadLabel, "추가 원판 합계");

  const bodyOnly = normalizeLocationEquipment({ equipment: ["맨몸"] });
  const bodyContext = { ...gym, equipment: bodyOnly.equipment, equipmentItems: bodyOnly.equipmentItems };
  const bodyPool = availableExercises(bodyContext, plan);
  assert.ok(bodyPool.some((item) => item.id === "calf_raise"));
  assert.equal(bodyPool.some((item) => item.id === weighted.id), false);

  for (const name of ["스쿼트 머신", "핵 스쿼트 머신", "브이 스쿼트 머신"]) {
    const place = normalizeLocationEquipment({ equipment: [name] });
    assert.ok(place.equipmentItems.some((item) => item.id === "squat_machine"), name);
    assert.ok(availableExercises({ ...gym, equipment: place.equipment, equipmentItems: place.equipmentItems }, plan).some((item) => item.id === weighted.id), name);
  }
  for (const name of ["스쿼트 랙", "바벨", "머신"]) {
    const place = normalizeLocationEquipment({ equipment: [name] });
    assert.equal(availableExercises({ ...gym, equipment: place.equipment, equipmentItems: place.equipmentItems }, plan).some((item) => item.id === weighted.id), false, name);
  }

  const machinePlace = normalizeLocationEquipment({ equipment: ["맨몸", "스쿼트 머신"] });
  const context = {
    ...gym,
    equipment: machinePlace.equipment,
    equipmentItems: machinePlace.equipmentItems.map((item) => item.id === "squat_machine" ? { ...item, instanceId: "hack-1", availableLoads: [5, 10, 15, 20, 25], loadSteps: [5] } : item),
  };
  const pool = availableExercises(context, plan);
  const session = makeSession(plan, [], "2026-10-10", "LEGS", context);
  const selectedCalf = session.exercises.find((item) => item.pattern === "calf_raise");
  assert.equal(selectedCalf.id, weighted.id);
  assert.equal(selectedCalf.loadBasis, "total");
  assert.ok(replacementOptions(bodyweight, pool, [bodyweight]).some((item) => item.id === weighted.id));
  assert.ok(replacementOptions(weighted, pool, [weighted]).some((item) => item.id === bodyweight.id));

  const repeatedHistory = ["2026-10-01", "2026-10-03"].map((date) => ({
    date, status: "complete", label: "LEGS",
    exercises: [{ ...weighted, completedSets: [{ weight: 15, reps: 12 }] }],
  }));
  const machineDefaultPlan = { ...plan, preferMachinesWhenEquivalent: false, preferredExerciseIds: ["calf_raise"] };
  const repeatedSession = makeSession(machineDefaultPlan, repeatedHistory, "2026-10-10", "LEGS", context);
  assert.equal(repeatedSession.exercises.find((item) => item.pattern === "calf_raise").id, weighted.id);
  const fixedRules = normalizeTrainingRules({ split: "ppl", fixedExerciseIds: ["calf_raise"] }, intake, EXERCISES);
  const fixedBodyweightPlan = normalizePlan({ trainingRules: fixedRules }, intake);
  assert.equal(makeSession(fixedBodyweightPlan, [], "2026-10-10", "LEGS", context).exercises.find((item) => item.pattern === "calf_raise").id, bodyweight.id);

  const machineHistory = [{ date: "2026-10-01", context, exercises: [
    { ...weighted, equipmentKey: equipmentKeyForExercise(weighted, context), loadBasis: "total", completedSets: [{ weight: 20, reps: 12, loadBasis: "total" }] },
    { id: "squat", equipmentKey: equipmentKeyForExercise(weighted, context), completedSets: [{ weight: 180, reps: 8 }] },
  ] }];
  assert.equal(loadBasisForExercise(weighted, context), "total");
  assert.equal(recommendedSetInput(weighted, machineHistory, { context }).weight, 20);
  assert.equal(availableNextLoad(20, { availableLoads: [5, 10, 15, 20, 25], loadSteps: [5], loadBasis: "total" }), 25);
  const legacyHistory = [{ date: "2026-10-02", context: bodyContext, exercises: [{ ...bodyweight, completedSets: [{ reps: 18 }] }] }];
  assert.equal(recommendedSetInput(weighted, legacyHistory, { context }).source, "target");
  assert.equal(recommendedSetInput(bodyweight, legacyHistory, { context: bodyContext }).reps, 18);
});

test("남은 세트량은 최근 실제 기록과 현재 진행한 세트를 반영하고 이미 시작한 종목은 보존한다", () => {
  const history = [{ date: "2026-09-24", status: "complete", exercises: ["bench", "chest_press"].map((id) => ({ ...EXERCISES.find((item) => item.id === id), sets: 3, completedSets: [{}, {}, {}] })) }];
  const current = { date: "2026-09-28", activeExerciseIndex: 0, exercises: [
    { ...EXERCISES.find((item) => item.id === "bench"), sets: 3, targetSets: 3, startConfirmed: true, completedSets: [{}, {}, {}] },
    { ...EXERCISES.find((item) => item.id === "chest_press"), sets: 3, targetSets: 3, startConfirmed: true, completedSets: [{}, {}, {}] },
    { ...EXERCISES.find((item) => item.id === "triceps"), sets: 3, targetSets: 3, completedSets: [] },
  ] };
  const adjusted = adaptRemainingVolume(current, history, "2026-09-28");
  assert.equal(adjusted.exercises[0].sets, 3);
  assert.equal(adjusted.exercises[2].sets, 2);
  assert.equal(adjusted.activeExerciseIndex, 0);
  assert.equal(history[0].exercises[0].completedSets.length, 3);
});

test("최근 노출만으로 다음 순환을 깎지 않고 과한 최근 볼륨과 피로가 함께 있을 때만 반영한다", () => {
  const history = [{ date: "2026-09-27", status: "complete", exercises: ["bench", "chest_press"].map((id) => ({ ...EXERCISES.find((item) => item.id === id), completedSets: Array.from({ length: 6 }, () => ({})) })) }];
  const session = { date: "2026-09-28", generalWarmup: { exercises: [] }, exercises: [{ ...EXERCISES.find((item) => item.id === "triceps"), baseSets: 3, sets: 3, targetSets: 3, minimumSets: 1, completedSets: [] }] };
  const fresh = adaptRemainingVolume(session, history, "2026-09-28", { fatigue: 0 });
  const fatigued = adaptRemainingVolume(session, history, "2026-09-28", { fatigue: 3 });
  assert.equal(fresh.exercises[0].sets, 3);
  assert.equal(fatigued.exercises[0].sets, 2);
  assert.equal(fresh.recentVolumeFatigueApplied, false);
  assert.equal(fatigued.recentVolumeFatigueApplied, true);
});

test("시간 추정은 선택 세트부터 줄이고 주요 운동 세트를 보존한다", () => {
  const session = { context: { durationMinutes: 3 }, generalWarmup: { exercises: [] }, exercises: [
    { ...EXERCISES.find((item) => item.id === "bench"), baseSets: 3, sets: 3, minimumSets: 3, priority: "essential", completedSets: [] },
    { ...EXERCISES.find((item) => item.id === "cable_fly"), baseSets: 3, sets: 3, minimumSets: 1, priority: "optional", completedSets: [] },
  ] };
  const adapted = adaptRemainingVolume(session, [], "2026-09-28");
  assert.equal(adapted.exercises[0].sets, 3);
  assert.equal(adapted.exercises[1].sets, 1);
  assert.equal(adapted.timeOverrun, true);
});

test("운동 부하에서 직접·간접 세트와 관절 피로 및 반복 하락을 따로 계산한다", () => {
  const metrics = sessionLoadMetrics({ exercises: [{ id: "bench", muscles: ["chest"], indirectMuscles: ["triceps"], joints: ["shoulder"], completedSets: [{ reps: 10 }, { reps: 7 }] }] });
  assert.equal(metrics.muscles.chest.directSets, 2);
  assert.equal(metrics.muscles.triceps.indirectSets, 2);
  assert.equal(metrics.joints.shoulder.fatigue, 2);
  assert.equal(metrics.performanceDeclines[0].percent, 30);
  assert.equal(shouldEndExercise({ minimumSets: 2, maximumSets: 4, completedSets: [{}, {}] }, { exercises: [] }).end, false);
});

test("맨몸 플랭크는 중량·반복 측정 없이 유지 시간으로 영양 기록은 섭취량에 비례한다", () => {
  assert.equal(EXERCISES.find((item) => item.id === "plank").measurement, "hold_seconds");
  const meal = estimateMealNutrition({ product: { name: "요거트", nutrition: { calories: 100, protein: 10 } }, serving: 1.5 });
  assert.equal(meal.calories, 150);
  assert.equal(meal.protein, 15);
  assert.equal(meal.product.name, "요거트");
  assert.ok(meal.at);
});

test("식사 영양값은 직접 입력한 항목을 보존하고 빈 항목만 AI 추정값으로 채운다", () => {
  const merged = mergeMealNutrition({ calories: "320", protein: "", carbs: "0", fat: "" }, { calories: 500, protein: 42, carbs: 55, fat: 13 });
  assert.deepEqual(merged, { calories: 320, protein: 42, carbs: 0, fat: 13 });
  const at = "2026-09-28T12:30:00.000Z";
  assert.equal(estimateMealNutrition({ product: { name: "점심", nutrition: merged }, at }).at, at);
});

test("PPL 세 순환은 하체 역할과 복근 세 방향을 지키며 등 보조 종목을 바꾼다", () => {
  const place = normalizeLocationEquipment({ equipment: ["맨몸", "덤벨", "바벨", "스쿼트 랙", "벤치", "케이블 머신", "체스트 프레스 머신", "인클라인 해머 프레스 머신", "리버스 펙덱", "랫 풀다운 머신", "로우로우 머신", "4-Way Row 머신", "T바 로우", "하이 로우 머신", "프론트 로우 머신", "시티드 로우 머신", "풀오버 머신", "레그 프레스 머신", "레그 컬 머신", "힙 어브덕터 머신"] });
  const context = { ...gym, equipment: place.equipment, equipmentItems: place.equipmentItems };
  const plan = normalizePlan({ split: "ppl" }, { ...intake, preferences: "가슴 삼두 어깨 → 등 이두 전완 → 하체 복근 → 휴식. 랫풀다운은 항상, 로우로우·포웨이로우·T바로우·프론트로우·시티드로우·하이로우·풀오버 머신을 번갈아. 복근은 플랭크, 리버스 크런치, 힐 터치와 할로우 바디, 윗몸일으키기 선호.", preferMachinesWhenEquivalent: true });
  const history = [];
  const rounds = [];
  for (let round = 0; round < 3; round += 1) {
    const sessions = ["PUSH", "PULL", "LEGS"].map((type, offset) => {
      const session = makeSession(plan, history, `2026-10-${String(round * 4 + offset + 1).padStart(2, "0")}`, type, context);
      history.push({ ...session, status: "complete" });
      return session;
    });
    rounds.push(sessions);
  }
  for (const [push, pull, legs] of rounds) {
    assert.deepEqual(push.exercises.slice(0, 2).map((item) => item.pattern), ["horizontal_press", "incline_press"]);
    assert.deepEqual(push.exercises.filter((item) => item.target === "어깨").map((item) => item.pattern), ["lateral_raise", "rear_delt"]);
    assert.deepEqual(pull.exercises.slice(0, 4).map((item) => item.pattern), ["vertical_pull", "horizontal_pull", "upper_back", "lat_isolation"]);
    assert.equal(pull.exercises[0].id, "lat_pulldown");
    assert.deepEqual(legs.exercises.slice(0, 5).map((item) => item.pattern), ["squat", legs.exercises[1].pattern, "squat", "hip_abduction", "calf_raise"]);
    assert.equal(legs.exercises[0].id, "squat");
    assert.equal(legs.exercises[1].id, "leg_curl");
    assert.equal(legs.exercises[2].id, "leg_press");
    assert.equal(legs.exercises[3].name, "아웃타이");
    assert.equal(legs.exercises.some((item) => item.id === "rdl"), false);
    assert.deepEqual(legs.exercises.slice(5).map((item) => item.pattern), ["core_stability", legs.exercises[6].pattern, "core_lateral"]);
    assert.ok(["core_flexion", "core_lower"].includes(legs.exercises[6].pattern));
    assert.ok(legs.exercises.slice(5).every((item) => item.sets >= 1 && item.sets <= 2 && item.warmupSets === 0));
    assert.equal(legs.exercises[0].sets, 3);
    assert.equal(legs.exercises[1].sets, 3);
    assert.ok(legs.exercises.slice(5).every((item) => item.sets >= 1 && item.sets <= 2));
    assert.equal(legs.timeOverrun, false);
    assert.ok(legs.estimatedSeconds <= legs.context.durationMinutes * 60);
    assert.ok(legs.exercises.reduce((sum, item) => sum + item.sets, 0) <= 21);
  }
  assert.equal(new Set(rounds.map(([, pull]) => pull.exercises[1].id)).size, 3);
  assert.ok(new Set(rounds.map(([, pull]) => pull.exercises.slice(1, 4).map((item) => item.id).join("|"))).size >= 3);
  assert.ok(new Set(rounds.map(([push]) => push.exercises.slice(2, 4).map((item) => item.id).join("|"))).size >= 2);
  for (const minutes of [30, 45]) {
    const shortPull = makeSession(plan, history, "2026-10-15", "PULL", { ...context, durationMinutes: minutes });
    assert.ok(shortPull.exercises.some((item) => item.id === "lat_pulldown"));
    assert.ok(shortPull.exercises.some((item) => item.kind === "forearms"));
    const shortLegs = makeSession(plan, history, "2026-10-15", "LEGS", { ...context, durationMinutes: minutes });
    assert.equal(shortLegs.exercises.some((item) => item.id === "rdl"), false);
  }
});

test("같은 로우 머신의 와이드 변형은 별도 상부 등 운동과 기록으로 취급한다", () => {
  const place = normalizeLocationEquipment({ equipment: ["로우로우 머신", "4-Way Row 머신", "시티드 로우 머신", "케이블 머신", "랫 풀다운 머신"] });
  const pool = availableExercises({ ...gym, equipment: place.equipment, equipmentItems: place.equipmentItems }, localPlan(intake));
  for (const id of ["low_row_wide", "four_way_row_wide", "seated_row_machine_wide", "cable_row_wide", "lat_pulldown_neutral"]) assert.ok(pool.some((item) => item.id === id));
  const narrow = pool.find((item) => item.id === "low_row");
  const wide = pool.find((item) => item.id === "low_row_wide");
  assert.equal(wide.pattern, "upper_back");
  assert.ok(replacementOptions(narrow, pool, [narrow]).some((item) => item.id === wide.id));
  assert.equal(recommendedSetInput(wide, [{ date: "2026-09-28", exercises: [{ ...narrow, completedSets: [{ weight: 40, reps: 10 }] }] }]).weight, 0);
  assert.equal(recommendedSetInput(wide, [{ date: "2026-09-28", exercises: [{ ...wide, completedSets: [{ weight: 30, reps: 12 }] }] }]).weight, 30);
  assert.equal(classifyWorkoutInput("양쪽 35초 했어").setRecord.durationSeconds, 35);
});

test("와이드 풀다운과 어시스트 친업은 선호 및 기구 후보에서 각자 구분된다", () => {
  const place = normalizeLocationEquipment({ equipment: ["랫 풀다운 머신", "어시스트 풀업/친업 머신"] });
  const pool = availableExercises({ ...gym, equipment: place.equipment, equipmentItems: place.equipmentItems }, localPlan(intake));
  assert.ok(pool.some((item) => item.id === "lat_pulldown_wide"));
  assert.ok(pool.some((item) => item.id === "assisted_pullup"));
  assert.ok(pool.some((item) => item.id === "assisted_chinup"));
  const legacyStored = { equipment: place.equipment, equipmentItems: place.equipmentItems.map((item) => item.id === "assisted_pullup" ? { ...item, exerciseIds: ["assisted_pullup"], instanceId: "assisted-machine-1" } : item) };
  assert.equal(equipmentForExercise(EXERCISES.find((item) => item.id === "assisted_chinup"), legacyStored).id, "assisted_pullup");
  const widePlan = localPlan({ ...intake, preferences: "와이드 풀다운을 선호" });
  assert.ok(widePlan.preferredExerciseIds.includes("lat_pulldown_wide"));
  assert.equal(widePlan.preferredExerciseIds.includes("lat_pulldown"), false);
  const chinupPlan = localPlan({ ...intake, preferences: "어시스트 친업을 선호" });
  assert.ok(chinupPlan.preferredExerciseIds.includes("assisted_chinup"));
  assert.equal(chinupPlan.preferredExerciseIds.includes("assisted_pullup"), false);
  const pull = makeSession(widePlan, [], "2026-10-03", "PULL", { ...gym, equipment: place.equipment, equipmentItems: place.equipmentItems });
  assert.equal(pull.exercises[0].id, "lat_pulldown_wide");
});

test("기존 세 운동 ID는 기구·대체 후보와 자연어 선호에 연결되고 구버전 장소 기구도 정규화한다", () => {
  const dbLocation = normalizeLocationEquipment({
    equipment: ["덤벨"],
    equipmentItems: [{ id: "dumbbell", label: "덤벨", exerciseIds: ["old_curl_id"] }],
  });
  const dbPool = availableExercises({ ...gym, equipment: dbLocation.equipment, equipmentItems: dbLocation.equipmentItems }, localPlan(intake));
  for (const id of ["curl", "lateral_raise"]) assert.ok(dbPool.some((item) => item.id === id), `덤벨 후보 ${id}`);
  assert.ok(dbLocation.equipmentItems.find((item) => item.id === "dumbbell").exerciseIds.includes("curl"));
  assert.ok(dbLocation.equipmentItems.find((item) => item.id === "dumbbell").exerciseIds.includes("lateral_raise"));

  for (const equipment of ["랫 풀다운 머신", "케이블 머신"]) {
    const location = normalizeLocationEquipment({ equipment: [equipment] });
    const pool = availableExercises({ ...gym, equipment: location.equipment, equipmentItems: location.equipmentItems }, localPlan(intake));
    assert.ok(pool.some((item) => item.id === "lat_pulldown_wide"), `${equipment}에서 와이드 풀다운 노출`);
  }

  const combinedLocation = normalizeLocationEquipment({ equipment: ["덤벨", "케이블 머신", "랫 풀다운 머신"] });
  const combinedPool = availableExercises({ ...gym, equipment: combinedLocation.equipment, equipmentItems: combinedLocation.equipmentItems }, localPlan(intake));
  const cablePulldown = combinedPool.find((item) => item.id === "lat_pulldown");
  assert.ok(replacementOptions(cablePulldown, combinedPool, [cablePulldown]).some((item) => item.id === "lat_pulldown_wide"));

  const curl = combinedPool.find((item) => item.id === "curl");
  const lateral = combinedPool.find((item) => item.id === "lateral_raise");
  const cableCurl = EXERCISES.find((item) => item.id === "cable_curl");
  const cableLateral = EXERCISES.find((item) => item.id === "cable_lateral_raise");
  assert.ok(replacementOptions(cableCurl, combinedPool, [cableCurl]).some((item) => item.id === curl.id));
  assert.ok(replacementOptions(cableLateral, combinedPool, [cableLateral]).some((item) => item.id === lateral.id));
  assert.equal(replacementOptions(cableLateral, combinedPool, [cableLateral, lateral]).some((item) => item.id === lateral.id), false);

  for (const [phrase, id] of [
    ["와이드 풀다운 선호", "lat_pulldown_wide"],
    ["랫 풀다운 와이드 그립 선호", "lat_pulldown_wide"],
    ["덤벨컬 선호", "curl"],
    ["덤벨사레레 선호", "lateral_raise"],
    ["사레레 선호", "lateral_raise"],
  ]) {
    const plan = localPlan({ ...intake, preferences: phrase });
    assert.deepEqual(plan.preferredExerciseIds, [id], phrase);
  }
});
