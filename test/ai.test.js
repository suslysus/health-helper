import test from "node:test";
import assert from "node:assert/strict";
import { analyzeMealPhoto, callGemini, estimateMeal, interpretTrainingRules } from "../src/lib/ai.js";
import { currentTrainingRules } from "../src/lib/trainingRules.js";
import { normalizePlan } from "../src/lib/program.js";

test("Gemini 무료 Flash-Lite endpoint에 보안 헤더와 JSON schema를 보낸다", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"value":"ok"}' }] } }] }),
    };
  };
  try {
    const result = await callGemini("test-key", "JSON으로 답한다.", { input: "test" }, "test", {
      type: "object", additionalProperties: false, properties: { value: { type: "string" } }, required: ["value"],
    });
    assert.deepEqual(result, { value: "ok" });
    assert.match(request.url, /gemini-3\.1-flash-lite:generateContent$/);
    assert.equal(request.options.headers["x-goog-api-key"], "test-key");
    assert.equal(request.body.generationConfig.responseMimeType, "application/json");
    assert.equal(request.body.generationConfig.responseJsonSchema.properties.value.type, "string");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("식사 사진 분석은 이미지와 JSON 형식의 영수증 항목을 Gemini에 보낸다", async () => {
  const originalFetch = globalThis.fetch;
  let body;
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ kind: "receipt", name: "", basis: "", portionBasis: "", assumptions: "", explanation: "", nutrition: { calories: "", protein: "", carbs: "", fat: "" }, items: [{ name: "김밥", purchasedAmount: "2줄" }] }) }] } }] }) };
  };
  try {
    const result = await analyzeMealPhoto("test-key", { mimeType: "image/jpeg", data: "YWJj" });
    assert.equal(result.items[0].name, "김밥");
    assert.deepEqual(body.contents[0].parts[1], { inlineData: { mimeType: "image/jpeg", data: "YWJj" } });
    assert.deepEqual(body.generationConfig.responseJsonSchema.properties.kind.enum, ["nutrition_label", "receipt", "food", "unknown"]);
  } finally { globalThis.fetch = originalFetch; }
});

test("식사 영양 추정은 섭취량 입력을 보내고 검토용 기준 필드를 반환한다", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    const result = { calories: 700, protein: 30, carbs: 60, fat: 35, portionBasis: "치킨 4조각과 감자튀김 낱개 10개", assumptions: "치킨 부위는 보통 크기로 가정", explanation: "조리된 튀김 기준 추정" };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] }) };
  };
  try {
    const result = await estimateMeal("test-key", { name: "뿌링클 4조각 + 뿌링감자튀김 10개", providedNutrition: { protein: "0" } });
    assert.equal(result.portionBasis, "치킨 4조각과 감자튀김 낱개 10개");
    assert.deepEqual(JSON.parse(request.contents[0].parts[0].text), { name: "뿌링클 4조각 + 뿌링감자튀김 10개", providedNutrition: { protein: "0" } });
    assert.deepEqual(request.generationConfig.responseJsonSchema.required, ["calories", "protein", "carbs", "fat", "portionBasis", "assumptions", "explanation"]);
  } finally { globalThis.fetch = originalFetch; }
});

test("AI가 문장 선호를 검토 가능한 설정으로 반환하면 그 설정이 계획에 연결된다", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  const intake = { goal: "근육 증가", preferences: "등날 전완도 같이, 로우로우 선호", avoid: "", experience: "초급", preferMachinesWhenEquivalent: true };
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    const rules = { split: "ppl", restAfterCycle: true, preferMachinesWhenEquivalent: true, varyExercises: true, preferredExerciseIds: ["low_row"], fixedExerciseIds: [], excludedExerciseIds: [], priorities: ["horizontal_pull", "brachioradialis"], sessionOrders: { PUSH: [], PULL: ["horizontal_pull", "vertical_pull"], LEGS: [] }, patternSessions: { rear_delt: "PULL" }, unresolved: ["현재 목록에 없는 요청"] };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(rules) }] } }] }) };
  };
  try {
    const rules = await interpretTrainingRules("test-key", intake);
    assert.equal(currentTrainingRules(intake, rules), rules);
    const plan = normalizePlan({ trainingRules: rules }, intake);
    assert.equal(plan.pullForearms, true);
    assert.deepEqual(plan.preferredExerciseIds, ["low_row"]);
    assert.deepEqual(plan.trainingRules.sessionOrders.PULL, ["horizontal_pull", "vertical_pull"]);
    assert.deepEqual(plan.patternSessions, { rear_delt: "PULL" });
    assert.ok(request.generationConfig.responseJsonSchema.properties.patternSessions);
    assert.deepEqual(plan.trainingRules.unresolved, ["현재 목록에 없는 요청"]);
    assert.ok(JSON.parse(request.contents[0].parts[0].text).exercises.some((item) => item.id === "low_row"));
  } finally { globalThis.fetch = originalFetch; }
});
