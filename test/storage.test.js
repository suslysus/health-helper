import test from "node:test";
import assert from "node:assert/strict";
import { hasStartedSession, loadAppData, saveAppData } from "../src/lib/storage.js";
import { INITIAL_INTAKE, EXERCISES, makeSession, normalizeLocationEquipment } from "../src/lib/program.js";
import { normalizeTrainingRules } from "../src/lib/trainingRules.js";

test("계획과 운동 기록을 로컬 저장소에서 다시 읽는다", () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const data = { intake: { ...INITIAL_INTAKE, goal: "근육 증가" }, plan: { split: "full_body" }, drafts: {}, history: [{ date: "2026-09-22", exercises: [] }], revisions: [], meals: [], favoriteProducts: [], weights: [], postponements: [], locations: [{ id: "gym", name: "헬스장", equipment: ["맨몸", "덤벨"], ready: true }] };
  assert.equal(saveAppData(data), true);
  const loaded = loadAppData();
  assert.deepEqual({ ...loaded, plan: { split: loaded.plan.split } }, { ...data, history: [{ ...data.history[0], recordSchemaVersion: 2, generalWarmup: loaded.history[0].generalWarmup }], locations: [{ ...data.locations[0], equipmentItems: loaded.locations[0].equipmentItems }] });
  assert.equal(loaded.locations[0].equipmentItems.find((item) => item.id === "dumbbell").loadSteps.length > 0, true);
});

test("기존 프로필의 주간 횟수·고정 시간·개인 기구 설정은 읽을 때 제거한다", () => {
  const legacy = { intake: { goal: "근육 증가", experience: "초급", preferences: "", avoid: "", daysPerWeek: 4, durationMinutes: 60, equipment: ["덤벨"] }, plan: { split: "hybrid", daysPerWeek: 4, durationMinutes: 60 }, locations: [{ id: "gym", name: "헬스장", equipment: ["덤벨"] }, { id: "place-1", name: "공원", equipment: ["철봉"] }] };
  globalThis.localStorage = { getItem: () => JSON.stringify(legacy), setItem: () => {} };
  assert.deepEqual(loadAppData().intake, { goal: "근육 증가", experience: "초급", preferences: "", avoid: "", preferMachinesWhenEquivalent: true });
  assert.equal(loadAppData().plan.split, "hybrid");
  assert.deepEqual(loadAppData().locations.map((item) => item.ready), [false, true]);
});

test("명시한 PPL과 다른 이전 운동 초안은 제거하고 장소는 보존한다", () => {
  const saved = {
    intake: { goal: "린벌크", experience: "중급", preferences: "가슴 삼두 어깨, 등 이두, 하체 복근, 휴식", avoid: "" },
    plan: { split: "hybrid" },
    drafts: { "2026-09-27": { label: "전신", exercises: [] } },
    history: [], revisions: [], locations: [{ id: "place-1", name: "헬스장", equipment: ["덤벨"], ready: true }],
  };
  globalThis.localStorage = { getItem: () => JSON.stringify(saved), setItem: () => {} };
  const loaded = loadAppData();
  assert.equal(loaded.plan.split, "ppl");
  assert.equal(loaded.plan.restAfterCycle, true);
  assert.deepEqual(loaded.drafts, {});
  assert.equal(loaded.locations[0].name, "헬스장");
});

test("식사 타임라인과 자주 먹는 제품, 장소별 중량 단계가 다시 읽을 때 보존된다", () => {
  const saved = {
    intake: { ...INITIAL_INTAKE, goal: "건강" }, plan: { split: "ppl" }, drafts: {}, history: [], revisions: [],
    meals: [{ date: "2026-09-27", name: "요거트", calories: 150, protein: 15, at: "2026-09-27T03:00:00.000Z" }],
    favoriteProducts: [{ name: "요거트", nutrition: { calories: 100, protein: 10 } }],
    weights: [{ id: "weight-2026-09-27", date: "2026-09-27", weight: 60.5 }],
    locations: [{ id: "home", name: "집", equipment: ["덤벨"], equipmentItems: [{ id: "dumbbell", label: "덤벨", variants: ["조절식 덤벨"], loadSteps: [1, 2] }], ready: true }],
  };
  globalThis.localStorage = { getItem: () => JSON.stringify(saved), setItem: () => {} };
  const loaded = loadAppData();
  assert.deepEqual(loaded.meals, saved.meals);
  assert.deepEqual(loaded.favoriteProducts, saved.favoriteProducts);
  assert.deepEqual(loaded.weights, saved.weights);
  assert.deepEqual(loaded.locations[0].equipmentItems.find((item) => item.id === "dumbbell").loadSteps, [1, 2]);
  assert.deepEqual(loaded.plan.sessionContracts.map((item) => item.label), ["PUSH", "PULL", "LEGS", "REST"]);
});

test("사용자 영양 목표를 재실행 후 보존하며 기존 식사와 체중 기록을 유지한다", () => {
  const saved = {
    intake: { ...INITIAL_INTAKE }, plan: { split: "ppl" }, drafts: {}, history: [], revisions: [],
    nutritionSettings: { calories: 2200, proteinGrams: 117, fatGrams: 51 },
    meals: [{ date: "2026-10-08", name: "식사", calories: 500, protein: 30 }],
    weights: [{ date: "2026-10-08", weight: 60 }], locations: [],
  };
  globalThis.localStorage = { getItem: () => JSON.stringify(saved), setItem: () => {} };
  const loaded = loadAppData();
  assert.deepEqual(loaded.nutritionSettings, { mode: "auto", ...saved.nutritionSettings });
  assert.deepEqual(loaded.meals, saved.meals);
  assert.deepEqual(loaded.weights, saved.weights);
});

test("자동 매크로가 체중 변화로 설정 열량을 넘더라도 목표 설정은 재실행 후 보존한다", () => {
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const saved = { intake: { ...INITIAL_INTAKE }, plan: { split: "ppl" }, history: [], locations: [],
    nutritionSettings: { calories: 2000, proteinGrams: null, fatGrams: null }, weights: [{ date, weight: 200 }] };
  globalThis.localStorage = { getItem: () => JSON.stringify(saved), setItem: () => {} };
  assert.deepEqual(loadAppData().nutritionSettings, { mode: "auto", ...saved.nutritionSettings });
});

test("체중 기록이 모두 삭제되어도 자동값 설정을 재실행 후 보존한다", () => {
  const saved = { intake: { ...INITIAL_INTAKE }, plan: { split: "ppl" }, history: [], locations: [],
    nutritionSettings: { calories: 2000, proteinGrams: null, fatGrams: null }, weights: [] };
  globalThis.localStorage = { getItem: () => JSON.stringify(saved), setItem: () => {} };
  assert.deepEqual(loadAppData().nutritionSettings, { mode: "auto", ...saved.nutritionSettings });
});

test("빈 자동 영양 설정은 저장 가능하고, 자동 모드 마이그레이션은 과거 입력을 백업한다", () => {
  const values = new Map();
  globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const data = { intake: { ...INITIAL_INTAKE }, plan: null, drafts: {}, history: [], revisions: [], locations: [],
    nutritionSettings: { mode: "auto", calories: null, proteinGrams: null, fatGrams: null },
    meals: [{ date: "2026-10-08", name: "식사", calories: 400 }], weights: [{ date: "2026-10-08", weight: 60 }] };
  assert.equal(saveAppData(data), true);
  assert.deepEqual(loadAppData().nutritionSettings, data.nutritionSettings);
  assert.deepEqual(loadAppData().meals, data.meals);
  assert.deepEqual(loadAppData().weights, data.weights);

  globalThis.localStorage = { getItem: () => JSON.stringify({ ...data, nutritionSettings: { calories: 2200, proteinGrams: 117, fatGrams: 51 } }), setItem: () => {} };
  assert.deepEqual(loadAppData().nutritionSettings, { mode: "auto", calories: 2200, proteinGrams: 117, fatGrams: 51 });
});

test("명시한 수동 영양 설정은 재실행 후 수동 모드로 보존한다", () => {
  const settings = { mode: "manual", calories: 2200, proteinGrams: 117, fatGrams: 51 };
  globalThis.localStorage = { getItem: () => JSON.stringify({ nutritionSettings: settings }), setItem: () => {} };
  assert.deepEqual(loadAppData().nutritionSettings, settings);
});

test("이전 버전의 잘못된 프로필 제외 결과를 고치고 시작 전 초안을 다시 만든다", () => {
  const preferences = "PPL 후 하루 휴식. PULL에는 랫 풀다운을 항상 포함하고 4-Way Row, 하이 로우, 풀오버 머신을 번갈아 하고 싶음.";
  const avoid = "다른 머신끼리 kg 숫자를 직접 비교하지 않기\n레그프레스는 골반이 말리기 전까지만 내리기\n인클라인 프레스에서 통증이 생기면 즉시 중단";
  const equipment = ["맨몸", "덤벨", "케이블 머신", "랫풀다운 머신", "4-Way Row 머신", "하이 로우 머신", "풀오버 머신"];
  const context = { durationMinutes: 60, locationId: "gym", locationName: "헬스장", equipment };
  const saved = {
    intake: { ...INITIAL_INTAKE, preferences, avoid, preferMachinesWhenEquivalent: true },
    plan: { split: "ppl", version: 5, preferredExerciseIds: ["plank"], excludedExerciseIds: ["lat_pulldown", "four_way_row", "high_row", "pullover_machine"] },
    drafts: { "2026-09-28": { date: "2026-09-28", label: "PULL", planVersion: 5, context, generalWarmup: { completed: false }, exercises: [{ id: "superman", kind: "back", completedWarmups: [], completedSets: [] }] } },
    history: [], revisions: [], locations: [{ id: "gym", name: "헬스장", equipment, ready: true }],
  };
  globalThis.localStorage = { getItem: () => JSON.stringify(saved), setItem: () => {} };
  const loaded = loadAppData();
  const draft = loaded.drafts["2026-09-28"];
  const backIds = draft.exercises.filter((item) => item.kind === "back").map((item) => item.id);
  assert.equal(loaded.plan.version, 6);
  assert.equal(loaded.plan.preferenceRulesVersion, 4);
  assert.deepEqual(loaded.plan.excludedExerciseIds, []);
  assert.equal(draft.planVersion, 6);
  assert.ok(backIds.includes("lat_pulldown"));
  assert.equal(backIds.includes("superman"), false);
});

test("하체 추천 규칙이 바뀌면 시작 전 초안만 레그 컬과 아웃타이로 갱신한다", () => {
  const intake = { ...INITIAL_INTAKE, preferences: "PPL 후 하루 휴식" };
  const context = { durationMinutes: 60, locationId: "gym", locationName: "헬스장", equipment: ["맨몸", "덤벨", "바벨", "스쿼트 랙", "레그 컬 머신", "레그 프레스 머신", "아웃타이 머신"] };
  const oldDraft = { date: "2026-09-29", label: "LEGS", planVersion: 3, context, generalWarmup: { completed: false }, exercises: [{ id: "rdl", kind: "legs", completedWarmups: [], completedSets: [] }] };
  const saved = { intake, plan: { split: "ppl", version: 3, preferenceRulesVersion: 4 }, drafts: { "2026-09-29": oldDraft }, history: [], locations: [] };
  globalThis.localStorage = { getItem: () => JSON.stringify(saved), setItem: () => {} };
  const loaded = loadAppData();
  assert.equal(loaded.plan.version, 4);
  assert.equal(loaded.drafts["2026-09-29"].planVersion, 4);
  assert.deepEqual(loaded.drafts["2026-09-29"].exercises.slice(0, 4).map((item) => item.id), ["squat", "leg_curl", "leg_press", "hip_abductor"]);
});

test("확인한 설정과 REST 초안, 이전 방식으로 시작한 세트 기록을 재실행해도 보존한다", () => {
  const intake = { ...INITIAL_INTAKE, goal: "근육 증가", preferences: "PPL 후 하루 휴식" };
  const trainingRules = normalizeTrainingRules({ split: "ppl", restAfterCycle: true, pullForearms: true, preferredExerciseIds: ["low_row"], sessionOrders: { PULL: ["horizontal_pull", "vertical_pull"] } }, intake);
  const actual = { weight: 40, reps: 8, rir: 2, recommendationSnapshot: { weight: 42.5, reps: 8 } };
  const saved = { intake, plan: { version: 5, preferenceRulesVersion: 4, routineRulesVersion: 2, trainingRules }, history: [], locations: [], drafts: {
    "2026-09-29": { date: "2026-09-29", label: "상체 A", activeStartedAt: 100, exercises: [{ id: "bench", completedSets: [actual] }] },
    "2026-09-30": { date: "2026-09-30", label: "REST", planVersion: 5, exercises: [] },
  } };
  globalThis.localStorage = { getItem: () => JSON.stringify(saved), setItem: () => {} };
  const loaded = loadAppData();
  assert.equal(loaded.plan.pullForearms, true);
  assert.deepEqual(loaded.plan.trainingRules.sessionOrders.PULL, ["horizontal_pull", "vertical_pull"]);
  assert.equal(loaded.drafts["2026-09-30"].label, "REST");
  assert.deepEqual(loaded.drafts["2026-09-29"].exercises[0].completedSets[0].recommendationSnapshot, actual.recommendationSnapshot);
  assert.equal(loaded.drafts["2026-09-29"].exercises[0].completedSets[0].weight, 40);
});

test("이전 프로필의 후면어깨 운동일 요청을 재실행 후 새 초안에 적용하고 시작한 기록은 보존한다", () => {
  const intake = { ...INITIAL_INTAKE, goal: "근육 증가", preferences: "PPL 후 하루 휴식. 후면어깨는 등날로 옮겨줘." };
  const trainingRules = normalizeTrainingRules({ split: "ppl", restAfterCycle: true }, intake, EXERCISES);
  delete trainingRules.patternSessions;
  const context = { ...normalizeLocationEquipment({ equipment: ["덤벨", "케이블 머신", "랫 풀다운 머신"] }), durationMinutes: 60, locationId: "gym" };
  const saved = { intake, plan: { version: 5, preferenceRulesVersion: 4, routineRulesVersion: 2, trainingRules }, history: [], locations: [], drafts: {
    "2026-10-02": { date: "2026-10-02", label: "PUSH", planVersion: 5, context, exercises: [{ id: "cable_rear_delt", completedSets: [] }] },
    "2026-10-03": { date: "2026-10-03", label: "PULL", planVersion: 5, activeStartedAt: 100, context, exercises: [{ id: "lat_pulldown", completedSets: [{ weight: 40, reps: 10 }] }] },
  } };
  globalThis.localStorage = { getItem: () => JSON.stringify(saved), setItem: () => {} };
  const loaded = loadAppData();
  assert.equal(loaded.plan.patternSessions.rear_delt, "PULL");
  assert.equal(loaded.drafts["2026-10-02"].exercises.some((item) => item.pattern === "rear_delt"), false);
  assert.deepEqual(loaded.drafts["2026-10-03"].exercises[0].completedSets, [{ status: "normal", weight: 40, reps: 10 }]);
  assert.ok(makeSession(loaded.plan, [], "2026-10-04", "PULL", context).exercises.some((item) => item.pattern === "rear_delt"));
});

test("첫 세트 기록 전 일시정지한 운동도 프로필 변경이나 마이그레이션으로 덮어쓰지 않는다", () => {
  const paused = { date: "2026-10-02", label: "상체 A", planVersion: 1, startedAt: "2026-10-02T09:00:00.000Z", activeStartedAt: null, elapsedSeconds: 30, exercises: [{ id: "bench", startConfirmed: true, completedSets: [] }] };
  assert.equal(hasStartedSession(paused), true);
  assert.equal(hasStartedSession({ exercises: [{ warmupSkipped: true }] }), true);
  assert.equal(hasStartedSession({ exercises: [{ completedSets: [] }] }), false);
  const saved = { intake: { ...INITIAL_INTAKE, preferences: "PPL. 후면어깨는 등날로" }, plan: { split: "ppl", version: 2, preferenceRulesVersion: 4, routineRulesVersion: 2 }, drafts: { "2026-10-02": paused }, history: [], locations: [] };
  globalThis.localStorage = { getItem: () => JSON.stringify(saved), setItem: () => {} };
  const restored = loadAppData().drafts["2026-10-02"];
  assert.equal(restored.label, "상체 A");
  assert.equal(restored.exercises[0].startConfirmed, true);
  assert.equal(restored.elapsedSeconds, 30);
});

test("기존 데이터는 러닝 필드 없이 그대로 읽고, 러닝 기록과 진행 중 세션은 다시 불러온다", () => {
  globalThis.localStorage = { getItem: () => JSON.stringify({ intake: { ...INITIAL_INTAKE }, plan: { split: "ppl" }, history: [], locations: [] }), setItem: () => {} };
  const legacy = loadAppData();
  assert.equal(Object.hasOwn(legacy, "runningHistory"), false);
  assert.equal(Object.hasOwn(legacy, "activeRun"), false);

  const activeRun = { id: "run-live", date: "2026-10-09", mode: "outdoor", status: "paused", elapsedMs: 42_000, distanceMeters: 510, track: [{ latitude: 37, longitude: 127 }] };
  const runningHistory = [{ id: "run-done", date: "2026-10-08", mode: "treadmill", status: "completed", distanceMeters: 5000, elapsedMs: 1_800_000 }];
  const values = new Map();
  globalThis.localStorage = { getItem: () => values.get("health-helper-v1") ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(saveAppData({ ...legacy, activeRun, runningHistory }), true);
  const loaded = loadAppData();
  assert.deepEqual(loaded.activeRun, activeRun);
  assert.deepEqual(loaded.runningHistory, runningHistory);
});

test("러닝 경로는 5초 간격과 분기점만 직렬화하며 총계·랩과 메모리 상태는 보존한다", () => {
  const track = Array.from({ length: 20 }, (_, index) => ({
    latitude: 37 + index / 100_000,
    longitude: 127 + index / 100_000,
    timestamp: 1_800_000_000_000 + index * 1000,
    elapsedMs: index * 1000,
    distanceMeters: index * 8,
    segment: index < 13 ? 0 : 1,
  }));
  const laps = [
    { index: 1, kind: "auto", elapsedMs: 400_000, distanceMeters: 1000, totalElapsedMs: 400_000, totalDistanceMeters: 1000 },
    { index: 2, kind: "manual", elapsedMs: 80_000, distanceMeters: 210, totalElapsedMs: 480_000, totalDistanceMeters: 1210 },
  ];
  const completed = { id: "run-long", date: "2026-10-09", status: "completed", elapsedMs: 480_000, distanceMeters: 1210, track, laps };
  const activeRun = { ...completed, id: "run-active", status: "running", track };
  const values = new Map();
  globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };

  assert.equal(saveAppData({ runningHistory: [completed], activeRun }), true);
  const saved = JSON.parse(values.get("health-helper-v1"));
  const expectedIndexes = [0, 5, 10, 12, 13, 18, 19];
  assert.deepEqual(saved.runningHistory[0].track.map((point) => point.elapsedMs / 1000), expectedIndexes);
  assert.deepEqual(saved.activeRun.track.map((point) => point.elapsedMs / 1000), expectedIndexes);
  assert.deepEqual(saved.runningHistory[0].laps, laps);
  assert.equal(saved.runningHistory[0].elapsedMs, completed.elapsedMs);
  assert.equal(saved.runningHistory[0].distanceMeters, completed.distanceMeters);
  assert.equal(completed.track.length, 20);
  assert.equal(activeRun.track.length, 20);
  assert.deepEqual(loadAppData().runningHistory[0].laps, laps);
});
