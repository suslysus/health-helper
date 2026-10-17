import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNutritionSettings, nutritionGoalDirection, nutritionTargets, recentWeightSummary, validateNutritionSettings, weeklyWeightAverages } from "../src/lib/body.js";

test("주간 요약은 월요일부터 일요일까지를 비교하고 일요일·월요일 경계를 지킨다", () => {
  const records = [{ date: "2026-10-04", weight: 70 }, { date: "2026-10-05", weight: 71 }];
  const monday = recentWeightSummary(records, "2026-10-05");
  assert.equal(monday.currentWeekStart, "2026-10-05");
  assert.equal(monday.currentWeekEnd, "2026-10-11");
  assert.equal(monday.previousWeekStart, "2026-09-28");
  assert.equal(monday.previousWeekEnd, "2026-10-04");
  assert.equal(monday.currentWeekAverage, 71);
  assert.equal(monday.previousWeekAverage, 70);
  assert.equal(monday.weeklyChange, 1);
  assert.equal(monday.weeklyChangePercent, 1.43);
  assert.equal(recentWeightSummary(records, "2026-10-04").currentWeekAverage, 70);
});

test("현재 주는 선택 날짜까지의 유효 기록만 실제 기록일 수로 평균내고 지난주와 비교한다", () => {
  const records = [
    { date: "2026-09-28", weight: 70 }, { date: "2026-10-04", weight: 72 },
    { date: "2026-10-05", weight: 60 }, { date: "2026-10-09", weight: 62 }, { date: "2026-10-10", weight: 64 },
    { date: "2026-10-11", weight: 100 }, { date: "2026-10-12", weight: 999 },
  ];
  const summary = recentWeightSummary(records, "2026-10-10");
  assert.equal(summary.currentWeekAverage, 62);
  assert.equal(summary.previousWeekAverage, 71);
  assert.equal(summary.daysRecorded, 3);
  assert.equal(summary.previousDaysRecorded, 2);
  assert.equal(summary.weeklyChange, -9);
  assert.equal(summary.weeklyChangePercent, -12.68);
  assert.equal(summary.latest.date, "2026-10-10");
});

test("이전 주가 비어 있으면 비교값은 null이고 결측 날짜를 0으로 채우지 않는다", () => {
  const summary = recentWeightSummary([{ date: "2026-10-06", weight: 71 }, { date: "2026-10-08", weight: 73 }], "2026-10-10");
  assert.equal(summary.currentWeekAverage, 72);
  assert.equal(summary.previousWeekAverage, null);
  assert.equal(summary.previousDaysRecorded, 0);
  assert.equal(summary.weeklyChange, null);
  assert.equal(summary.weeklyChangePercent, null);
  const empty = recentWeightSummary([], "2026-10-10");
  assert.equal(empty.currentWeekAverage, null);
  assert.equal(empty.previousWeekAverage, null);
});

test("주간 그래프는 최대 8개의 월~일 날짜 범위를 표시하고 선택일 이후 기록을 뺀다", () => {
  const records = [
    { date: "2026-09-21", weight: 70 }, { date: "2026-09-28", weight: 70.4 },
    { date: "2026-10-10", weight: 72 }, { date: "2026-10-11", weight: 99 },
  ];
  const groups = weeklyWeightAverages(records, "2026-10-10", 3);
  assert.deepEqual(groups, [
    { startDate: "2026-09-21", endDate: "2026-09-27", average: 70, daysRecorded: 1 },
    { startDate: "2026-09-28", endDate: "2026-10-04", average: 70.4, daysRecorded: 1 },
    { startDate: "2026-10-05", endDate: "2026-10-11", average: 72, daysRecorded: 1 },
  ]);
});

test("총열량과 단백질·지방 목표에서 탄수화물을 계산하고 에너지 합이 맞는다", () => {
  const targets = nutritionTargets(60, { mode: "manual", calories: 2200, proteinGrams: 117, fatGrams: 51 });
  assert.equal(targets.carbs, 318);
  assert.ok(Math.abs(targets.protein * 4 + targets.carbs * 4 + targets.fat * 9 - targets.calories) <= 2);
  assert.equal(normalizeNutritionSettings({ mode: "manual", calories: "2200", proteinGrams: "117", fatGrams: "51" }).calories, 2200);
});

test("자동 목표는 체중과 목표에 맞춰 추정하고 열량은 50 단위로 정리한다", () => {
  const maintenance = nutritionTargets(60, null, "건강 유지");
  const gain = nutritionTargets(60, null, "근육 증가");
  const loss = nutritionTargets(60, null, "체지방 감량");
  assert.equal(maintenance.calories, 2000);
  assert.equal(gain.calories, 2200);
  assert.equal(loss.calories, 1800);
  assert.equal(nutritionTargets(70).protein, 120);
  assert.equal(nutritionTargets(75).protein, 130);
  assert.equal(nutritionTargets(80).protein, 140);
  assert.equal(maintenance.carbs, Math.round((2000 - maintenance.protein * 4 - maintenance.fat * 9) / 4));
  for (const targets of [maintenance, gain, loss]) {
    assert.ok(Math.abs(targets.protein * 4 + targets.carbs * 4 + targets.fat * 9 - targets.calories) <= 2);
  }
});

test("명시적이지 않거나 부정된 감량·증량 표현은 유지 열량으로 계산한다", () => {
  assert.equal(nutritionGoalDirection("린벌크"), "gain");
  assert.equal(nutritionGoalDirection("체지방 감량"), "loss");
  assert.equal(nutritionGoalDirection("건강 유지"), "maintenance");
  assert.equal(nutritionTargets(60, null, "체지방 감량은 원하지 않음").calories, 2000);
  assert.equal(nutritionTargets(60, null, "감량 안함").calories, 2000);
  assert.equal(nutritionTargets(60, null, "근육 증가가 목표가 아닙니다").calories, 2000);
  assert.equal(nutritionTargets(60, null, "I don't want to lose weight").calories, 2000);
  assert.equal(nutritionTargets(60, null, "근육 증가와 체지방 감량").calories, 2000);
  assert.equal(nutritionTargets(60, null, "체성분 개선, 리컴프").calories, 2000);
});

test("자동값은 체중에 따라 변하고 체중이 없으면 숫자를 만들어 내지 않는다", () => {
  const first = nutritionTargets(60);
  const later = nutritionTargets(70);
  assert.notEqual(first.calories, later.calories);
  assert.notEqual(first.protein, later.protein);
  assert.notEqual(first.fat, later.fat);
  assert.deepEqual(nutritionTargets(null), { calories: null, protein: null, carbs: null, fat: null, basedOnWeight: null });
});

test("수동 설정은 빈 항목마다 자동값으로 돌아가고 직접 입력값은 적용한다", () => {
  const automatic = nutritionTargets(60);
  const partial = nutritionTargets(60, { mode: "manual", calories: "", proteinGrams: "125", fatGrams: null });
  assert.equal(partial.calories, automatic.calories);
  assert.equal(partial.protein, 125);
  assert.equal(partial.fat, automatic.fat);
});

test("영양 설정은 빈 자동값을 허용하고 유효하지 않은 숫자와 불가능한 수동 조합은 거부한다", () => {
  assert.deepEqual(normalizeNutritionSettings({}), { mode: "auto", calories: null, proteinGrams: null, fatGrams: null });
  assert.deepEqual(normalizeNutritionSettings({ calories: 2200, proteinGrams: "", fatGrams: "50" }), { mode: "auto", calories: 2200, proteinGrams: null, fatGrams: 50 });
  assert.equal(validateNutritionSettings({ mode: "auto", calories: "", proteinGrams: "", fatGrams: "" }, null), null);
  assert.ok(validateNutritionSettings({ mode: "auto", calories: "", proteinGrams: "", fatGrams: "" }, 60));
  assert.equal(normalizeNutritionSettings({ calories: Infinity, proteinGrams: 100, fatGrams: 50 }), null);
  assert.equal(normalizeNutritionSettings({ calories: 0.4, proteinGrams: 1, fatGrams: 1 }), null);
  assert.equal(validateNutritionSettings({ mode: "manual", calories: 1149, proteinGrams: 130, fatGrams: 70 }, 60), null);
  assert.equal(nutritionTargets(60, { mode: "manual", calories: 1149, proteinGrams: 130, fatGrams: 70 }).carbs, null);
});
