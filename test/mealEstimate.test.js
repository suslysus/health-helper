import test from "node:test";
import assert from "node:assert/strict";
import { clearAiDerivedNutrition, missingMealNutrition, prepareMealEstimateReview } from "../src/lib/mealEstimate.js";

test("review draft estimates only blank fields and preserves user-entered zero", () => {
  const input = { calories: "", protein: "0", carbs: "", fat: "4" };
  const review = prepareMealEstimateReview(input, { calories: 220, protein: 90, carbs: 25, fat: 80, portionBasis: "1 serving", assumptions: "cooked", explanation: "typical values" });
  assert.deepEqual(review.estimatedFields, ["calories", "carbs"]);
  assert.deepEqual(review.nutrition, { calories: 220, protein: 0, carbs: 25, fat: 4 });
  assert.equal(review.portionBasis, "1 serving");
  assert.deepEqual(missingMealNutrition({ calories: 0, protein: "0", carbs: "", fat: null }), ["carbs", "fat"]);
});

test("review rejects invalid estimate values and invalidates only AI-derived fields", () => {
  assert.throws(() => prepareMealEstimateReview({ calories: "", protein: 1 }, { calories: -1 }), /올바르게 계산/);
  assert.throws(() => prepareMealEstimateReview({ calories: "", protein: 1 }, { calories: Number.NaN }), /올바르게 계산/);
  for (const value of [null, undefined, "", " ", false, []]) assert.throws(() => prepareMealEstimateReview({ calories: "", protein: 1, carbs: 0, fat: 0 }, { calories: value }), /올바르게 계산/);
  assert.deepEqual(clearAiDerivedNutrition({ calories: "250", protein: "0", carbs: "22", fat: "9" }, ["calories", "carbs"]), { calories: "", protein: "0", carbs: "", fat: "9" });
});
