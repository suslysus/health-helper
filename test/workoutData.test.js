import test from "node:test";
import assert from "node:assert/strict";
import { EXERCISES, EXERCISE_BY_ID, EQUIPMENT_CATALOG } from "../src/lib/exerciseCatalog.js";
import { applyExerciseIds, completeExerciseWarmup, completedWarmupCount, workoutProgress, createPlannedExercise, estimatedSessionSeconds, makeSession, normalizePlan, recommendedSetInput, replaceExercise, adaptRemainingVolume } from "../src/lib/program.js";
import { hasStartedSession, historyThroughDate, recordedExercises, normalizeWorkoutSession } from "../src/lib/workoutHistory.js";
import { getRestPreview } from "../src/lib/restPreview.js";
import { sessionForDate } from "../src/lib/workoutState.js";
import { postponeWorkout } from "../src/lib/schedule.js";
import { normalizeTrainingRules } from "../src/lib/trainingRules.js";

const intake = { goal: "근육 증가", preferences: "PPL", experience: "초급", avoid: "" };
const plan = normalizePlan(null, intake);
const context = { durationMinutes: 60, locationId: "gym", equipment: ["맨몸", "덤벨", "벤치", "바벨", "케이블", "스쿼트 랙", "랫 풀다운 머신", "레그 컬 머신", "아웃타이 머신"] };
const savedExercise = (id, weight = 20) => ({ ...createPlannedExercise(EXERCISE_BY_ID[id], context), completedSets: [{ weight, reps: 10, rir: 2, status: "normal" }] });

test("운동 ID·근육·태그와 기구 역방향 목록은 하나의 카탈로그에서 일치한다", () => {
  assert.equal(new Set(EXERCISES.map((exercise) => exercise.id)).size, EXERCISES.length);
  for (const exercise of EXERCISES) {
    assert.equal(exercise.exerciseId, exercise.id);
    assert.ok(exercise.primaryMuscles.length);
    assert.deepEqual(exercise.muscles, exercise.primaryMuscles);
    assert.deepEqual(exercise.indirectMuscles, exercise.secondaryMuscles);
    for (const id of exercise.equipmentIds.filter((id) => id !== "machine")) {
      assert.ok(EQUIPMENT_CATALOG.find((equipment) => equipment.id === id)?.exerciseIds.includes(exercise.id), `${id}: ${exercise.id}`);
    }
  }
});

test("미래 기록과 초안을 제외하고 날짜 정렬된 기록만 루틴 생성에 사용한다", () => {
  const past = { date: "2026-10-01", status: "complete", label: "PUSH", exercises: [savedExercise("bench")] };
  const future = { date: "2026-11-01", status: "complete", label: "PULL", exercises: [savedExercise("lat_pulldown", 80)] };
  const draft = { ...future, date: "2026-10-02", status: "draft" };
  const expected = makeSession(plan, [past], "2026-10-03", null, context);
  assert.deepEqual(makeSession(plan, [future, draft, past], "2026-10-03", null, context), expected);
  assert.deepEqual(historyThroughDate([future, past], "2026-10-03"), [past]);
});

test("종목 교체 전에 완료한 세트도 정확한 운동 ID로 다음 중량 추천에 연결한다", () => {
  const session = { date: "2026-10-01", status: "complete", context, exercises: [{ ...savedExercise("bench", 45), completedSets: [{ weight: 45, reps: 8 }, { weight: 45, reps: 6, pain: true }] }] };
  const changed = replaceExercise(session, 0, "db_press");
  assert.deepEqual(recordedExercises(changed).map((exercise) => exercise.id), ["bench"]);
  assert.equal(changed.exercises[0].exerciseId, "db_press");
  assert.deepEqual(changed.exercises[0].primaryMuscles, EXERCISE_BY_ID.db_press.primaryMuscles);
  assert.equal(recommendedSetInput(EXERCISE_BY_ID.bench, [changed], { context, date: "2026-10-02" }).weight, 45);
  assert.equal(recommendedSetInput(EXERCISE_BY_ID.db_press, [changed], { context, date: "2026-10-02" }).source, "target");
});

test("최근 기록이 모두 통증 세트면 그보다 앞선 정상 수행으로 돌아간다", () => {
  const history = [
    { date: "2026-10-01", context, exercises: [savedExercise("bench", 40)] },
    { date: "2026-10-02", context, exercises: [{ ...savedExercise("bench", 100), completedSets: [{ weight: 100, reps: 2, status: "pain" }] }] },
  ];
  const next = recommendedSetInput(EXERCISE_BY_ID.bench, history, { context, date: "2026-10-03" });
  assert.equal(next.weight, 40);
  assert.equal(next.historyDate, "2026-10-01");
});

test("오래된 상한 반복 기록은 자동 증량을 보류하고 복귀 근거를 표시한다", () => {
  const exercise = createPlannedExercise(EXERCISE_BY_ID.curl, context);
  const history = [{ date: "2026-09-01", context, exercises: [{ ...exercise, completedSets: Array.from({ length: 3 }, () => ({ weight: 10, reps: 15, rir: 2 })) }] }];
  assert.equal(recommendedSetInput(exercise, history, { context, date: "2026-09-02" }).weight, 11);
  const returned = recommendedSetInput(exercise, history, { context, date: "2026-10-01" });
  assert.equal(returned.weight, 10);
  assert.match(returned.reason, /자동 증량을 보류/);
});

test("기록 추가·삭제 때 시작 전 초안만 갱신하고 수동 편집과 시작한 운동을 보존한다", () => {
  const draft = makeSession(plan, [], "2026-10-03", null, context);
  const data = { intake, plan, history: [], drafts: { [draft.date]: draft }, locations: [] };
  assert.equal(sessionForDate(data, draft.date), draft);
  const history = [{ date: "2026-10-02", label: "PUSH", status: "complete", exercises: [] }];
  assert.equal(sessionForDate({ ...data, history }, draft.date).label, "PULL");
  const started = { ...draft, startedAt: "2026-10-03T01:00:00Z", activeStartedAt: null };
  assert.equal(sessionForDate({ ...data, history, drafts: { [draft.date]: started } }, draft.date), started);
  const changed = sessionForDate({ ...data, history }, draft.date);
  assert.equal(sessionForDate({ ...data, drafts: { [draft.date]: changed } }, draft.date).label, "PUSH");
});

test("AI 종목 수정에서 장소 기구가 바뀌어도 시작한 기록과 워밍업을 유지한다", () => {
  const bench = { ...createPlannedExercise(EXERCISE_BY_ID.bench, context), completedWarmups: [{ weight: 20, reps: 10 }] };
  const session = { context: { ...context, equipment: ["맨몸", "덤벨"] }, exercises: [bench] };
  const revised = applyExerciseIds(session, ["lateral_raise", "curl"], plan);
  assert.equal(revised.exercises[0], bench);
  assert.ok(revised.exercises.slice(1).every((exercise) => exercise.exerciseId === exercise.id && Array.isArray(exercise.completedWarmups)));
});

test("30~120분 생성은 실제 휴식 시간을 포함하고 다시 조절해도 시간 예산을 유지한다", () => {
  for (const type of ["PUSH", "PULL", "LEGS"]) for (const minutes of [30, 45, 60, 75, 90, 120]) {
    const session = makeSession(plan, [], "2026-10-03", type, { ...context, durationMinutes: minutes });
    assert.ok(session.exercises.length);
    assert.ok(session.estimatedSeconds <= minutes * 60, `${type} ${minutes}: ${session.estimatedSeconds}`);
    assert.equal(session.estimatedSeconds, estimatedSessionSeconds(session));
    const again = adaptRemainingVolume(session, [], session.date);
    assert.ok(again.estimatedSeconds <= minutes * 60, `${type} regenerated`);
  }
});

test("불가능한 고정 운동 시간은 조용히 무시하지 않고 초과 상태로 남긴다", () => {
  const rules = normalizeTrainingRules({ split: "ppl", fixedExerciseIds: ["bench", "db_press", "ohp"] }, intake, EXERCISES);
  const fixedPlan = normalizePlan({ trainingRules: rules }, intake);
  const session = makeSession(fixedPlan, [], "2026-10-03", "PUSH", { ...context, durationMinutes: 5 });
  assert.equal(session.timeOverrun, true);
  for (const id of rules.fixedExerciseIds) assert.ok(session.exercises.some((exercise) => exercise.id === id));
});

test("구형 기록 정규화는 실제 세트와 추천 스냅샷을 유지하고 누락 태그를 채운다", () => {
  const snapshot = { weight: 20, source: "history" };
  const normalized = normalizeWorkoutSession({ exercises: [{ id: "bench", completedSets: [{ weight: 25, reps: 8, recommendationSnapshot: snapshot }] }] });
  assert.equal(normalized.recordSchemaVersion, 2);
  assert.equal(normalized.exercises[0].exerciseId, "bench");
  assert.deepEqual(normalized.exercises[0].primaryMuscles, ["chest"]);
  assert.deepEqual(normalized.exercises[0].completedSets[0].recommendationSnapshot, snapshot);
});

test("첫 세트 전 일시정지했거나 내일 기록이 있으면 미루기로 덮어쓰지 않는다", () => {
  const draft = { ...makeSession(plan, [], "2026-10-03", null, context), startedAt: "2026-10-03T01:00:00Z", activeStartedAt: null };
  const data = { plan, history: [], drafts: { [draft.date]: draft } };
  assert.equal(postponeWorkout(data, draft.date), data);
  const withTomorrow = { ...data, drafts: {}, history: [{ date: "2026-10-04", status: "complete" }] };
  assert.equal(postponeWorkout(withTomorrow, draft.date), withTomorrow);
});

test("구형 전완 설정은 공통 우선순위로 한 번 이전하고 사용자가 해제할 수 있다", () => {
  const legacy = normalizeTrainingRules({ split: "ppl", pullForearms: true }, intake, EXERCISES);
  assert.ok(legacy.priorities.includes("brachioradialis"));
  const edited = normalizeTrainingRules({ ...legacy, priorities: [] }, intake, EXERCISES);
  assert.equal(edited.pullForearms, false);
});

test("부분 완료 기록은 새 루틴으로 덮어쓰지 않고 재개한 초안을 우선한다", () => {
  const partial = { date: "2026-10-03", status: "partial", context, exercises: [savedExercise("bench", 25)] };
  const data = { intake, plan, history: [partial], drafts: {}, locations: [] };
  assert.equal(sessionForDate(data, partial.date), partial);
  assert.equal(postponeWorkout(data, partial.date), data);
  const resumed = { ...partial, status: "draft", activeStartedAt: "2026-10-03T01:00:00Z" };
  assert.equal(sessionForDate({ ...data, drafts: { [partial.date]: resumed } }, partial.date), resumed);
});

test("30분 루틴도 명시한 공통 우선순위를 순서와 최소 세트에 반영한다", () => {
  const rules = normalizeTrainingRules({ split: "ppl", priorities: ["lateral_raise"] }, intake, EXERCISES);
  const preferredPlan = normalizePlan({ trainingRules: rules }, intake);
  const session = makeSession(preferredPlan, [], "2026-10-03", "PUSH", { ...context, durationMinutes: 30 });
  assert.equal(session.exercises[0].pattern, "lateral_raise");
  assert.equal(session.exercises[0].priority, "essential");
  assert.ok(session.exercises[0].sets >= session.exercises[0].minimumSets);
  assert.equal(session.timeOverrun, false);
});

test("처음 수행하는 중량 운동은 0kg 자동 추천 대신 실제 중량 입력을 요청한다", () => {
  const suggested = recommendedSetInput(EXERCISE_BY_ID.db_press, [], { context });
  assert.equal(suggested.needsInitialLoad, true);
  const warmup = recommendedSetInput(EXERCISE_BY_ID.db_press, [], { context, phase: "warmup" });
  assert.equal(warmup.needsInitialLoad, true);
});

test("본세트가 없는 바벨·덤벨·보조기구는 워밍업 중량을 빈칸으로 둔다", () => {
  for (const id of ["bench", "squat", "db_press", "assisted_pullup"]) {
    const exercise = EXERCISE_BY_ID[id];
    assert.ok(exercise, id);
    const warmupOnly = { date: "2026-10-01", context, exercises: [{ ...exercise, completedWarmups: [{ weight: 80, reps: 12 }], completedSets: [] }] };
    const recommendation = recommendedSetInput(exercise, [warmupOnly], { context, phase: "warmup" });
    assert.equal(recommendation.weight, null, id);
    assert.equal(recommendation.needsInitialLoad, true, id);
  }
});

test("워밍업은 이전 워밍업 입력을 무시하고 본세트 중량으로 두 준비 세트를 추천한다", () => {
  const bench = createPlannedExercise(EXERCISE_BY_ID.bench, context);
  const history = [{ date: "2026-10-01", context, exercises: [{ ...bench, completedWarmups: [{ weight: 100, reps: 1 }], completedSets: [{ weight: 60, reps: 8, rir: 2 }] }] }];
  assert.equal(recommendedSetInput(bench, history, { context, phase: "warmup", warmupIndex: 0 }).weight, 30);
  assert.equal(recommendedSetInput(bench, history, { context, phase: "warmup", warmupIndex: 1 }).weight, 45);
  const currentSession = { context, exercises: [{ ...bench, completedSets: [{ weight: 40, reps: 8, rir: 2 }] }] };
  assert.equal(recommendedSetInput(bench, history, { context, currentSession, phase: "warmup" }).weight, 20);
});

test("워밍업 완료는 별도 세트를 추가하지 않고 진행률·휴식 목표·남은 시간에 반영된다", () => {
  const exercise = { ...createPlannedExercise(EXERCISE_BY_ID.bench, context), warmupSets: 2 };
  const session = { context, generalWarmup: { completed: true }, exercises: [exercise], restTimer: { kind: "warmup", exerciseId: exercise.id } };
  const completed = completeExerciseWarmup(session, 0);
  assert.equal(session.exercises[0].warmupCompleted, false);
  assert.deepEqual(completed.exercises[0].completedWarmups, []);
  assert.deepEqual(completed.exercises[0].completedSets, []);
  assert.equal(completedWarmupCount(completed.exercises[0]), 2);
  assert.equal(workoutProgress(completed).completed - workoutProgress(session).completed, 2);
  assert.equal(estimatedSessionSeconds(session) - estimatedSessionSeconds(completed), 190);
  assert.equal(getRestPreview(completed).phase, "work");
  assert.equal(hasStartedSession({ exercises: [{ warmupCompleted: true }] }), true);
  const legacy = { ...session, exercises: [{ ...exercise, completedWarmups: [{ weight: 20, reps: 10 }] }] };
  const migrated = normalizeWorkoutSession(completeExerciseWarmup(legacy, 0));
  assert.deepEqual(migrated.exercises[0].completedWarmups, legacy.exercises[0].completedWarmups);
  assert.equal(migrated.exercises[0].warmupCompleted, true);
});
