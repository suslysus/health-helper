function dateAtNoon(dateKey) {
  return new Date(`${dateKey}T12:00:00`).getTime();
}

function dateKeyFromMs(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function average(values) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function shiftDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateKeyFromMs(date.getTime());
}

function mondayOfWeek(dateKey) {
  const day = new Date(`${dateKey}T12:00:00`).getDay();
  return shiftDateKey(dateKey, -((day + 6) % 7));
}

function validWeightsThrough(weights, endDate) {
  const end = dateAtNoon(endDate);
  return weights.filter((item) => {
    const date = String(item?.date || "");
    const weight = Number(item?.weight);
    const time = dateAtNoon(date);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(time) && Number.isFinite(weight) && weight > 0 && time <= end;
  });
}

function averageRecordedDays(items) {
  const byDate = new Map();
  for (const item of items) {
    const readings = byDate.get(item.date) || [];
    readings.push(Number(item.weight));
    byDate.set(item.date, readings);
  }
  const dailyAverages = [...byDate.values()].map((readings) => readings.reduce((sum, value) => sum + value, 0) / readings.length);
  return { average: average(dailyAverages), rawAverage: dailyAverages.length ? dailyAverages.reduce((sum, value) => sum + value, 0) / dailyAverages.length : null, daysRecorded: dailyAverages.length };
}

export function recentWeightSummary(weights = [], endDate = dateKeyFromMs(Date.now())) {
  const currentWeekStart = mondayOfWeek(endDate);
  const currentWeekEnd = shiftDateKey(currentWeekStart, 6);
  const previousWeekStart = shiftDateKey(currentWeekStart, -7);
  const previousWeekEnd = shiftDateKey(currentWeekStart, -1);
  const valid = validWeightsThrough(weights, endDate);
  const current = averageRecordedDays(valid.filter((item) => item.date >= currentWeekStart && item.date <= currentWeekEnd));
  const previous = averageRecordedDays(valid.filter((item) => item.date >= previousWeekStart && item.date <= previousWeekEnd));
  const latest = [...valid].sort((a, b) => String(a.date).localeCompare(String(b.date))).at(-1) || null;
  const change = current.rawAverage != null && previous.rawAverage != null ? current.rawAverage - previous.rawAverage : null;
  const changePercent = change != null ? (change / previous.rawAverage) * 100 : null;
  return {
    latest,
    currentWeekStart,
    currentWeekEnd,
    previousWeekStart,
    previousWeekEnd,
    currentWeekAverage: current.average,
    previousWeekAverage: previous.average,
    weeklyChange: change == null ? null : Math.round(change * 10) / 10,
    weeklyChangePercent: changePercent == null ? null : Math.round(changePercent * 100) / 100,
    daysRecorded: current.daysRecorded,
    previousDaysRecorded: previous.daysRecorded,
  };
}

export function weeklyWeightAverages(weights = [], endDate = dateKeyFromMs(Date.now()), count = 8) {
  const currentWeekStart = mondayOfWeek(endDate);
  const valid = validWeightsThrough(weights, endDate);
  return Array.from({ length: count }, (_, index) => {
    const startDate = shiftDateKey(currentWeekStart, (index - count + 1) * 7);
    const endDate = shiftDateKey(startDate, 6);
    const summary = averageRecordedDays(valid.filter((item) => item.date >= startDate && item.date <= endDate));
    return { startDate, endDate, average: summary.average, daysRecorded: summary.daysRecorded };
  }).filter((item) => item.daysRecorded > 0);
}

function manualValue(settings, key) {
  if (settings?.mode !== "manual" || settings[key] == null || (typeof settings[key] === "string" && settings[key].trim() === "")) return null;
  const value = Number(settings[key]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export function nutritionGoalDirection(goal = "") {
  const text = String(goal || "").toLowerCase().replace(/\s+/g, " ");
  if (!text || /리컴프|recomp/.test(text)) return "maintenance";
  const clauses = text.split(/[\n.!?;,]+/);
  const hasIntent = (terms, negations) => clauses.some((clause) => terms.some((term) => {
    let offset = clause.indexOf(term);
    while (offset !== -1) {
      const before = clause.slice(Math.max(0, offset - 18), offset);
      const after = clause.slice(offset + term.length, offset + term.length + 18);
      if (!negations.some((negation) => before.includes(negation) || after.includes(negation))) return true;
      offset = clause.indexOf(term, offset + term.length);
    }
    return false;
  }));
  const gain = hasIntent(
    ["린벌크", "벌크업", "근육 증가", "근육량 증가", "체중 증가", "증량", "살 찌우", "gain muscle", "gain weight", "bulking"],
    ["아니", "아닙", "아님", "않", "안 ", "안함", "안 함", "안 해", "안 하", "못 ", "원치", "원하지", "하지 말", "not ", "don't", "do not", "without"],
  );
  const loss = hasIntent(
    ["체지방 감량", "지방 감량", "체중 감량", "감량", "살 빼", "다이어트", "fat loss", "lose weight", "cutting"],
    ["아니", "아닙", "아님", "않", "안 ", "안함", "안 함", "안 해", "안 하", "못 ", "원치", "원하지", "하지 말", "not ", "don't", "do not", "without"],
  );
  if (gain === loss) return "maintenance";
  return gain ? "gain" : "loss";
}

export function nutritionTargets(weightKg, settings = null, goal = "") {
  const weight = Number(weightKg);
  const hasWeight = Number.isFinite(weight) && weight > 0;
  const direction = nutritionGoalDirection(goal);
  const calorieFactor = direction === "gain" ? 1.1 : direction === "loss" ? 0.9 : 1;
  const automaticCalories = hasWeight ? Math.round((weight * 33 * calorieFactor) / 50) * 50 : null;
  const automaticProtein = hasWeight ? Math.round((weight * 1.75) / 10) * 10 : null;
  const automaticFat = hasWeight ? Math.round(weight * 0.7) : null;
  const calories = manualValue(settings, "calories") ?? automaticCalories;
  const protein = manualValue(settings, "proteinGrams") ?? automaticProtein;
  const fat = manualValue(settings, "fatGrams") ?? automaticFat;
  const caloriesSet = Number.isFinite(calories) && calories > 0;
  const remainingCalories = caloriesSet && Number.isFinite(protein) && Number.isFinite(fat)
    ? calories - protein * 4 - fat * 9
    : null;
  const carbs = remainingCalories != null && remainingCalories >= 0 ? Math.round(remainingCalories / 4) : null;
  return {
    calories: caloriesSet ? calories : null,
    protein: Number.isFinite(protein) ? protein : null,
    carbs: Number.isFinite(carbs) && carbs >= 0 ? carbs : null,
    fat: Number.isFinite(fat) ? fat : null,
    basedOnWeight: hasWeight ? Math.round(weight * 10) / 10 : null,
  };
}

export function normalizeNutritionSettings(input) {
  if (!input || typeof input !== "object") return null;
  const raw = input;
  const mode = raw.mode === "manual" ? "manual" : "auto";
  const parseValue = (value, minimum) => {
    if (value == null || (typeof value === "string" && value.trim() === "")) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= minimum ? Math.round(parsed) : NaN;
  };
  const calories = parseValue(raw.calories, 1);
  const proteinGrams = parseValue(raw.proteinGrams, 0);
  const fatGrams = parseValue(raw.fatGrams, 0);
  if ([calories, proteinGrams, fatGrams].some(Number.isNaN)) return null;
  return { mode, calories, proteinGrams, fatGrams };
}

export function validateNutritionSettings(input, weightKg = null, goal = "") {
  const settings = normalizeNutritionSettings(input);
  if (!settings) return null;
  const targets = nutritionTargets(weightKg, settings, goal);
  if (targets.calories == null || targets.protein == null || targets.fat == null || targets.carbs == null) return null;
  return settings;
}
