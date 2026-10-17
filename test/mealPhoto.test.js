import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMealPhotoAnalysis, scaleLabelNutrition } from "../src/lib/mealPhoto.js";

test("영수증은 구매 항목을 먹은 것으로 자동 선택하지 않는다", () => {
  const result = normalizeMealPhotoAnalysis({ kind: "receipt", items: [{ name: "김밥", purchasedAmount: "2줄" }] });
  assert.equal(result.items[0].selected, false);
  assert.equal(result.items[0].eatenAmount, "");
});

test("영양성분표는 읽힌 숫자만 실제 섭취 배수에 맞춰 계산한다", () => {
  const result = normalizeMealPhotoAnalysis({ kind: "nutrition_label", nutrition: { calories: "120", protein: "6", carbs: "모름", fat: "2.5" } });
  assert.deepEqual(scaleLabelNutrition(result.nutrition, "1.5"), { calories: "180", protein: "9", carbs: "", fat: "3.8" });
  assert.equal(scaleLabelNutrition(result.nutrition, "0"), null);
});

test("음식 사진 분석에서 섭취 기준과 불확실성 설명을 기록에 남긴다", () => {
  const result = normalizeMealPhotoAnalysis({ kind: "food", portionBasis: "치킨 조각의 먹는 부분", assumptions: "조각 크기는 보통으로 가정", explanation: "사진으로 부위는 확인하기 어려움" });
  assert.equal(result.portionBasis, "치킨 조각의 먹는 부분");
  assert.equal(result.assumptions, "조각 크기는 보통으로 가정");
  assert.equal(result.explanation, "사진으로 부위는 확인하기 어려움");
});
