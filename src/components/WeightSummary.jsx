const signed = (value, unit) => value == null ? "비교 기록 없음" : `${value > 0 ? "+" : ""}${Object.is(value, -0) ? 0 : value}${unit}`;
const shortDate = (date) => date ? `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}` : "";
const weekRange = (start, end) => `${shortDate(start)}–${shortDate(end)}`;

export default function WeightSummary({ summary }) {
  return <div className="weight-summary-row">
    <span><small>이번 주 평균</small><small>{weekRange(summary.currentWeekStart, summary.currentWeekEnd)} · 월~일</small><strong>{summary.currentWeekAverage != null ? `${summary.currentWeekAverage}kg` : "기록 없음"}</strong><small>{summary.daysRecorded}/7일 기록</small></span>
    <span><small>지난주 평균</small><small>{weekRange(summary.previousWeekStart, summary.previousWeekEnd)} · 월~일</small><strong>{summary.previousWeekAverage != null ? `${summary.previousWeekAverage}kg` : "기록 없음"}</strong><small>{summary.previousDaysRecorded}/7일 기록</small></span>
    <span><small>이번 주 − 지난주</small><strong>{signed(summary.weeklyChange, "kg")}</strong></span>
    <span><small>평균 변화율</small><strong>{signed(summary.weeklyChangePercent, "%")}</strong></span>
  </div>;
}
