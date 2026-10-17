import { mergeMealNutrition } from "./nutrition.js";

export const MEAL_NUTRIENTS = ["calories", "protein", "carbs", "fat"];

export function missingMealNutrition(input = {}) {
  return MEAL_NUTRIENTS.filter((key) => input[key] == null || String(input[key]).trim() === "");
}

export function prepareMealEstimateReview(input = {}, estimate = {}) {
  const estimatedFields = missingMealNutrition(input);
  const normalized = {};
  for (const key of estimatedFields) {
    const raw = estimate[key];
    if ((typeof raw !== "number" && typeof raw !== "string") || String(raw).trim() === "") throw new Error("AI가 영양값을 올바르게 계산하지 못했습니다. 직접 확인하거나 다시 시도해 주세요.");
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) throw new Error("AI가 영양값을 올바르게 계산하지 못했습니다. 직접 확인하거나 다시 시도해 주세요.");
    normalized[key] = value;
  }
  if (!estimatedFields.length) throw new Error("추정할 빈 영양값이 없습니다.");
  const provided = { ...input };
  for (const key of estimatedFields) provided[key] = "";
  return {
    nutrition: mergeMealNutrition(provided, normalized),
    estimatedFields,
    portionBasis: String(estimate.portionBasis || "먹은 양과 조리된 음식의 일반적인 먹는 부분을 기준으로 추정했습니다.").trim(),
    assumptions: String(estimate.assumptions || "음식 사진이나 제품 정보로 확인할 수 없는 조리법과 크기는 통상적인 값으로 가정했습니다.").trim(),
    explanation: String(estimate.explanation || "영양값은 일반적인 식품 성분을 바탕으로 한 추정치입니다.").trim(),
  };
}

export function clearAiDerivedNutrition(nutrition = {}, fields = []) {
  const next = { ...nutrition };
  for (const key of fields) if (MEAL_NUTRIENTS.includes(key)) next[key] = "";
  return next;
}
