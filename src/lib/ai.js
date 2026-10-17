import { registerPlugin } from "@capacitor/core";
import { EXERCISES } from "./exerciseCatalog.js";
import { createGeminiClient, GeminiError } from "./geminiClient.js";
import { TRAINING_PATTERNS, normalizeTrainingRules } from "./trainingRules.js";

const SecureStore = registerPlugin("SecureStore");
const KEY_NAME = "gemini_api_key";
const MODEL_NAME = "gemini-3.1-flash-lite";
const gemini = createGeminiClient();
const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

export async function readSecret(name) {
  if (globalThis.Capacitor?.isNativePlatform?.()) {
    const result = await SecureStore.get({ key: name });
    return result.value || "";
  }
  return localStorage.getItem(`health-helper-dev:${name}`) || "";
}

export async function writeSecret(name, value) {
  if (globalThis.Capacitor?.isNativePlatform?.()) {
    if (value) await SecureStore.set({ key: name, value });
    else await SecureStore.remove({ key: name });
    return;
  }
  // Browser-only development fallback. Android always uses the Keystore plugin.
  if (value) localStorage.setItem(`health-helper-dev:${name}`, value);
  else localStorage.removeItem(`health-helper-dev:${name}`);
}

export const readApiKey = async () => {
  const value = await readSecret(KEY_NAME);
  await writeSecret("openai_api_key", "");
  return value;
};
export const writeApiKey = async (value) => {
  gemini.clearCache();
  await writeSecret(KEY_NAME, value);
  await writeSecret("openai_api_key", "");
};

export async function callGemini(apiKey, instructions, input, schemaName, schema, image = null) {
  if (!apiKey?.trim()) throw new Error("프로필의 AI 설정에서 Gemini API 키를 입력해 주세요.");
  if (image && (!/^image\/(jpeg|png|webp)$/.test(image.mimeType) || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data))) throw new Error("지원하지 않는 사진 형식입니다. JPG 또는 PNG로 다시 선택해 주세요.");
  return gemini.request(API_ENDPOINT, apiKey.trim(), {
    systemInstruction: { parts: [{ text: instructions }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }, ...(image ? [{ inlineData: { mimeType: image.mimeType, data: image.data } }] : [])] }],
    generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema },
  }, { cacheMs: schemaName === "meal_estimate" ? 10 * 60_000 : 0, validate: (value) => validateStructuredOutput(value, schema) });
}

export function validateStructuredOutput(value, schema) {
  const valid = (value, rule) => {
    if (rule.type === "object") return value != null && typeof value === "object" && !Array.isArray(value)
      && (rule.required || []).every((key) => Object.hasOwn(value, key))
      && Object.entries(value).every(([key, child]) => rule.properties?.[key] ? valid(child, rule.properties[key]) : rule.additionalProperties !== false);
    if (rule.type === "array") return Array.isArray(value) && value.every((item) => valid(item, rule.items));
    if (rule.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) return false;
    if (["string", "boolean"].includes(rule.type) && typeof value !== rule.type) return false;
    return !rule.enum || rule.enum.includes(value);
  };
  if (!valid(value, schema)) throw new GeminiError("AI가 필요한 값을 모두 반환하지 못했습니다. 다시 시도하거나 직접 입력해 주세요.", { code: "invalid_response" });
  return value;
}

const strings = { type: "array", items: { type: "string" } };
export const trainingRulesSchema = {
  type: "object", additionalProperties: false,
  properties: {
    split: { type: "string", enum: ["full_body", "upper_lower", "ppl", "hybrid"] },
    restAfterCycle: { type: "boolean" }, preferMachinesWhenEquivalent: { type: "boolean" },
    varyExercises: { type: "boolean" },
    preferredExerciseIds: strings, excludedExerciseIds: strings, fixedExerciseIds: strings,
    priorities: { type: "array", items: { type: "string", enum: Object.keys(TRAINING_PATTERNS) } },
    sessionOrders: { type: "object", additionalProperties: false,
      properties: Object.fromEntries(["PUSH", "PULL", "LEGS"].map((type) => [type, { type: "array", items: { type: "string", enum: Object.keys(TRAINING_PATTERNS) } }])), required: ["PUSH", "PULL", "LEGS"] },
    patternSessions: { type: "object", additionalProperties: false,
      properties: Object.fromEntries(Object.keys(TRAINING_PATTERNS).map((pattern) => [pattern, { type: "string", enum: ["PUSH", "PULL", "LEGS"] }])) },
    unresolved: strings,
  }, required: ["split", "restAfterCycle", "preferMachinesWhenEquivalent", "varyExercises", "preferredExerciseIds", "excludedExerciseIds", "fixedExerciseIds", "priorities", "sessionOrders", "patternSessions", "unresolved"],
};
const trainingInstructions = "프로필 문장을 실제 운동 설정으로 변환한다. 명시된 목표·선호·제외·고정 순서를 우선하고 건강 상태를 임의로 진단하지 않는다. exerciseIds는 제공된 목록만 사용한다. 항상 포함 요청만 fixedExerciseIds로, 선호 요청은 preferredExerciseIds로 구분한다. sessionOrders에는 같은 운동일 안에서 사용자가 명시한 패턴 순서만 넣고 없으면 빈 배열로 한다. patternSessions에는 사용자가 특정 패턴을 PUSH/PULL/LEGS 중 어느 날에 하겠다고 명시한 경우에만 패턴 키와 세션 값을 넣고, 패턴 이동과 순서 지정은 구분한다. PPL과 휴식 여부, 머신 우선과 종목 순환(varyExercises)을 반영한다. 전완·어깨·코어 등 특정 부위 요청도 공통 priorities와 preferredExerciseIds로 표현한다. 주사용근·보조근·기구 태그를 함께 참고한다. 해석하지 못하거나 목록에 없거나 운동 생성 규칙으로 표현 불가능한 요청(특정 목표 체중·주기 길이·조건부 제약 등)은 unresolved에 사용자 문장으로 남긴다. 주의사항은 단순 제외로 오해하지 않는다. 목표만으로 종목이나 순서를 임의로 고정하지 않는다.";
const trainingCatalog = () => EXERCISES.map(({ id, name, pattern, equipmentIds, primaryMuscles, secondaryMuscles, tags }) => ({ id, name, pattern, equipmentIds, primaryMuscles, secondaryMuscles, tags }));
export async function interpretTrainingRules(apiKey, intake) {
  const raw = await callGemini(apiKey, trainingInstructions, { intake, exercises: trainingCatalog() }, "training_rules", trainingRulesSchema);
  return normalizeTrainingRules({ ...raw, interpretation: "ai" }, intake, EXERCISES);
}

const planSchema = {
  type: "object", additionalProperties: false,
  properties: {
    plan: { type: "object", additionalProperties: false, properties: {
      split: { type: "string", enum: ["full_body", "upper_lower", "ppl", "hybrid"] },
      restAfterCycle: { type: "boolean" },
      goalSummary: { type: "string" }, focus: { type: "string" }, rationale: { type: "string" },
      backVariety: { type: "boolean" }, excludedExerciseIds: { type: "array", items: { type: "string" } }, changeSummary: { type: "string" },
      trainingRules: trainingRulesSchema,
    }, required: ["split", "restAfterCycle", "goalSummary", "focus", "rationale", "backVariety", "excludedExerciseIds", "changeSummary", "trainingRules"] },
    exerciseIds: { type: "array", items: { type: "string" } }, alternatives: { type: "array", items: { type: "object", additionalProperties: false, properties: { split: { type: "string" }, reason: { type: "string" } }, required: ["split", "reason"] } },
    explanation: { type: "string" }, questions: { type: "array", items: { type: "string" } },
  }, required: ["plan", "exerciseIds", "alternatives", "explanation", "questions"],
};

export async function generatePlan(apiKey, payload) {
  const result = await callGemini(apiKey, `운동 코치. 사용자 목표와 이력을 바탕으로 안전하고 유연한 원칙을 JSON으로 제안한다. ${trainingInstructions} 현재 수정 요청이 있으면 수정된 원칙을 trainingRules로 반환한다.`, { ...payload, exercises: trainingCatalog() }, "workout_plan", planSchema);
  if (result.plan?.trainingRules) result.plan.trainingRules = normalizeTrainingRules({ ...result.plan.trainingRules, interpretation: "ai" }, payload.intake, EXERCISES);
  return result;
}

export async function parseLocation(apiKey, description) {
  return callGemini(apiKey, "장소 설명에서 이름과 실제 사용 가능한 운동 기구를 추출한다. equipment는 문자열 배열이다.", { description }, "gym_location", {
    type: "object", additionalProperties: false, properties: { name: { type: "string" }, equipment: { type: "array", items: { type: "string" } } }, required: ["name", "equipment"],
  });
}

export async function interpretCheckin(apiKey, text) {
  return callGemini(apiKey, "운동 전 자연어 체크인을 정규화한다. 응급 가능성이 있는 전신 증상은 redFlag true로 표시하고 확실하지 않으면 false와 확인 질문을 반환한다.", { text }, "workout_checkin", {
    type: "object", additionalProperties: false, properties: { redFlag: { type: "boolean" }, sleepDeprived: { type: "boolean" }, soreness: { type: "string" }, pain: { type: "string" }, followUp: { type: "string" } }, required: ["redFlag", "sleepDeprived", "soreness", "pain", "followUp"],
  });
}

export async function estimateMeal(apiKey, { name, providedNutrition = {} }) {
  return callGemini(apiKey, "식사 영양 추정 보조자. 이름에 적힌 수량은 실제 개수·조각·그램 등 그대로 해석한다. 예: '감자튀김 10개'는 낱개 10개이지 10인분이나 10봉지가 아니다. 이름에 없는 추가 메뉴, 음료, 소스/딥은 더하지 않는다. 튀김 음식은 일반적인 튀김 조리와 옷에 포함된 기름·코팅을 조리된 음식의 대표 영양값에 반영하고, 그 값을 쓴 뒤 기름이나 코팅을 다시 더하지 않는다. 닭처럼 뼈가 있는 음식은 실제로 먹는 조리 후 살·껍질·튀김옷을 포함한 부분을 기준으로 하고 뼈 무게는 제외한다. 생것과 조리된 음식의 성분값을 섞지 말고, 입력이 조리 음식이면 해당 조리 상태의 대표값을 사용한다. 부위·크기·뼈 유무가 불명확하면 통상적인 한 조각의 먹는 부분이라는 현실적인 가정을 적용하고 이를 assumptions와 portionBasis에 밝힌다. 특정 음식에 근거 없이 과하게 큰 양을 가정하지 않는다. 입력된 수량 전체의 열량·단백질·탄수화물·지방을 일반적인 조리 후 식품 성분의 대표값으로 추정한다. 사용자가 직접 입력한 영양값은 수정하지 않는다. portionBasis에는 계산에 적용한 수량과 먹는 부분 기준을 짧게 설명하고, assumptions에는 조리 상태·부위·크기 등 확인할 수 없어 적용한 가정만 적는다. 당류를 총 탄수화물로, 포화지방을 총 지방으로 혼동하지 않는다. 실제로 제공된 공식 자료가 없으면 공식 수치를 확인했다고 주장하지 않는다. 브랜드/레시피에 따른 수치 정밀도를 가장하지 말고, 숫자는 추정치라고 분명히 한다.", { name, providedNutrition }, "meal_estimate", {
    type: "object", additionalProperties: false,
    properties: {
      calories: { type: "number" }, protein: { type: "number" }, carbs: { type: "number" }, fat: { type: "number" },
      portionBasis: { type: "string" }, assumptions: { type: "string" }, explanation: { type: "string" },
    },
    required: ["calories", "protein", "carbs", "fat", "portionBasis", "assumptions", "explanation"],
  });
}

export async function analyzeMealPhoto(apiKey, image) {
  return callGemini(apiKey, "식사 기록용 사진을 분석한다. kind는 nutrition_label(영양성분표), receipt(영수증), food(실제 음식), unknown 중 하나다. 영양성분표에서는 보이는 제품명, 영양성분 숫자, 표기 기준(100g당 또는 1회 제공량)을 그대로 읽고 읽히지 않는 값은 빈 문자열로 둔다. 영수증에서는 실제 음식·음료 항목과 구매 수량만 items에 적고, 구매했다고 모두 먹었다고 가정하거나 영양값을 만들지 않는다. 음식 사진에서는 보이는 실제 개수와 크기를 기준으로 추정하고 사진에서 불분명한 양을 여러 인분으로 부풀리지 않는다. 뼈가 있는 음식은 뼈를 제외한 조리 후 먹는 부분을 기준으로 하고, 생것과 조리된 식품 성분값을 섞지 않는다. 튀김은 일반 조리 시 흡수되는 기름과 코팅을 조리된 음식의 대표값에 반영하며, 같은 기름이나 코팅을 다시 더하지 않는다. 사진에 보이지 않는 소스·딥·음료는 포함하지 않는다. 사진만으로 분량·부위·조리법을 알 수 없으면 portionBasis와 assumptions에 적용한 통상적인 가정을 적고 추정의 불확실성을 explanation에 밝힌다. 음식이 아니거나 불명확하면 unknown으로 답한다. 숫자 단위는 kcal와 g이고 nutrition 값은 단위 없는 숫자 문자열로 반환한다. 사진에 없는 개인정보는 반환하지 않는다.", { task: "식사 사진 분류와 기록 초안 작성" }, "meal_photo", {
    type: "object", additionalProperties: false,
    properties: {
      kind: { type: "string", enum: ["nutrition_label", "receipt", "food", "unknown"] },
      name: { type: "string" }, basis: { type: "string" }, portionBasis: { type: "string" }, assumptions: { type: "string" }, explanation: { type: "string" },
      nutrition: { type: "object", additionalProperties: false, properties: { calories: { type: "string" }, protein: { type: "string" }, carbs: { type: "string" }, fat: { type: "string" } }, required: ["calories", "protein", "carbs", "fat"] },
      items: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, purchasedAmount: { type: "string" } }, required: ["name", "purchasedAmount"] } },
    },
    required: ["kind", "name", "basis", "portionBasis", "assumptions", "explanation", "nutrition", "items"],
  }, image);
}
