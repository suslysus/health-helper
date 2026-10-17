export function estimateMealNutrition({ product, serving = 1, at } = {}) {
  const nutrition = product?.nutrition || {};
  const count = Math.max(0, Number(serving) || 0);
  return { name: String(product?.name || "식사 직접 기록"), product: { name: String(product?.name || "식사"), nutrition: { calories: Number(nutrition.calories) || 0, protein: Number(nutrition.protein) || 0, carbs: Number(nutrition.carbs) || 0, fat: Number(nutrition.fat) || 0 } }, serving: count, calories: Math.round((Number(nutrition.calories) || 0) * count), protein: Math.round((Number(nutrition.protein) || 0) * count), carbs: Math.round((Number(nutrition.carbs) || 0) * count), fat: Math.round((Number(nutrition.fat) || 0) * count), at: at || new Date().toISOString() };
}

export function mergeMealNutrition(input = {}, estimate = {}) {
  return Object.fromEntries(["calories", "protein", "carbs", "fat"].map((key) => {
    const provided = input[key] !== "" && input[key] != null;
    return [key, provided ? Number(input[key]) || 0 : Math.max(0, Number(estimate[key]) || 0)];
  }));
}
