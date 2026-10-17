import { CalendarClock, ChevronLeft, ChevronRight, Dumbbell, Footprints } from "lucide-react";
import { useState } from "react";
import { cycleLabel, restRecommended, SPLITS } from "../lib/program";
import { hasStartedSession, recordedExercises } from "../lib/workoutHistory";
import Modal from "./Modal";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const keyFor = (year, month, day) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export default function HomeScreen({ selectedDate, setSelectedDate, session, todaySession, todayRestRecommended, postponements = [], history, drafts, meals = [], todayDate, plan, onDeleteWorkout, onStartWorkout, onPostponeWorkout, onUndoPostponement, onOpenRoutine, onOpenMeals, onOpenRunning, runningSuggestion }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [year, month, day] = selectedDate.split("-").map(Number);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const dayCount = new Date(year, month, 0).getDate();
  const completed = history.find((item) => item.date === selectedDate);
  const selectedPostponement = postponements.find((item) => item.date === selectedDate);
  const todayPostponement = postponements.find((item) => item.date === todayDate);
  const selectedDraft = drafts[selectedDate];
  const started = hasStartedSession(selectedDraft);
  const selectedRest = restRecommended(plan, history, selectedDate) && !completed && !started && !selectedDraft?.manualType && !selectedPostponement;
  const planned = selectedPostponement || selectedRest ? null : session || selectedDraft;
  const dayExerciseCount = completed?.exercises.length ?? planned?.exercises.length;
  const dayMeals = meals.filter((meal) => meal.date === selectedDate);
  const dayWorkout = completed || (selectedDate === todayDate ? planned : drafts[selectedDate]);
  const timeline = [
    ...(dayWorkout ? [{ at: dayWorkout.completedAt || `${selectedDate}T09:00:00`, type: "workout", label: `${dayWorkout.label} 운동`, detail: `${dayWorkout.exercises?.length || 0}개 종목 · ${recordedExercises(dayWorkout).reduce((sum, item) => sum + item.completedSets.length, 0)}세트` }] : []),
    ...dayMeals.map((meal) => ({ at: meal.at, type: "meal", label: meal.name, detail: `${meal.calories}kcal · 단백질 ${meal.protein}g` })),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const changeMonth = (difference) => {
    const target = new Date(year, month - 1 + difference, 1);
    setSelectedDate(keyFor(target.getFullYear(), target.getMonth() + 1, 1));
  };

  return (
    <div className="screen home-screen">
      <section className="calendar-card card priority-card">
        <div className="section-heading calendar-heading">
          <button className="icon-button muted" onClick={() => changeMonth(-1)} aria-label="이전 달"><ChevronLeft size={18} /></button>
          <div><span className="eyebrow">CALENDAR</span><h2>{year}년 {month}월</h2></div>
          <button className="icon-button muted" onClick={() => changeMonth(1)} aria-label="다음 달"><ChevronRight size={18} /></button>
        </div>
        <div className="calendar-grid weekday-row">{weekdays.map((name) => <span key={name}>{name}</span>)}</div>
        <div className="calendar-grid days-grid">
          {Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}
          {Array.from({ length: dayCount }, (_, index) => {
            const date = keyFor(year, month, index + 1);
            const recorded = history.find((item) => item.date === date);
            const resting = !recorded && restRecommended(plan, history, date) && !drafts[date]?.manualType;
            const drafted = !recorded && !resting && (Boolean(drafts[date]) || (date === todayDate && !todayRestRecommended));
            const postponed = !recorded && postponements.some((item) => item.date === date);
            const state = recorded?.status === "complete" ? "complete" : recorded?.status === "partial" ? "partial" : postponed ? "postponed" : resting ? "rest" : drafted ? "planned" : null;
            return <button key={date} className={`calendar-day ${selectedDate === date ? "selected" : ""}`} onClick={() => setSelectedDate(date)} aria-label={`${month}월 ${index + 1}일 ${state === "complete" ? "운동 완료" : state === "partial" ? "일부 기록" : state === "postponed" ? "운동 미룸" : state === "rest" ? "휴식 권장" : state === "planned" ? "운동 예정" : "기록 없음"}`}>
              <span>{index + 1}</span>{state && <i className={`day-dot ${state}`} />}
            </button>;
          })}
        </div>
        <div className="calendar-legend"><span><i className="legend-dot complete" />완료</span><span><i className="legend-dot partial" />일부 기록</span><span><i className="legend-dot postponed" />미룸</span><span><i className="legend-dot planned" />예정</span><span><i className="legend-dot rest" />휴식</span></div>
      </section>

      <section className="card day-summary-card">
        <div className="section-heading compact"><div><span className="eyebrow">SELECTED DAY</span><h2>{month}월 {day}일</h2></div><button className="text-button" onClick={() => setDetailsOpen(true)}>자세히</button></div>
        <dl className="summary-list">
          <div><dt>운동</dt><dd>{completed ? `${completed.label} ${completed.status === "partial" ? "일부 기록" : "완료"}` : selectedPostponement ? `${selectedPostponement.label} 다음 날로 미룸` : selectedRest ? "휴식 권장" : planned ? `${planned.label} ${planned.exercises.length ? "예정" : "준비 전"}` : "기록 없음"}</dd></div>
          <div><dt>운동 방식</dt><dd>{cycleLabel(plan)}</dd></div>
          <div><dt>운동 종목</dt><dd>{dayExerciseCount == null ? "기록 없음" : dayExerciseCount ? `${dayExerciseCount}개` : "준비 전"}</dd></div>
        </dl>
      </section>

      {todayPostponement ? <section className="card workout-brief postponed-workout"><div className="brief-icon"><CalendarClock size={22} /></div><div className="brief-copy"><span className="eyebrow">POSTPONED</span><h2>오늘 운동을 내일로 미뤘어요</h2><p>{todayPostponement.label} 순서는 유지되며 {Number(todayPostponement.targetDate.slice(5, 7))}월 {Number(todayPostponement.targetDate.slice(8, 10))}일에 이어집니다.</p></div><button className="secondary-button compact-button" onClick={onUndoPostponement}>되돌리기</button></section> : todayRestRecommended ? <section className="card workout-brief"><div className="brief-icon">Zz</div><div className="brief-copy"><span className="eyebrow">TODAY'S RECOVERY</span><h2>오늘은 휴식 권장</h2><p>주기 끝 회복일입니다. 다음 운동은 {SPLITS[plan.split]?.sessions[0]}로 이어집니다.</p></div><button className="text-button" onClick={onStartWorkout}>오늘 운동 선택</button></section> : todaySession && <section className="card workout-brief">
        <div className="brief-icon"><Dumbbell size={22} /></div>
        <div className="brief-copy"><span className="eyebrow">TODAY'S WORKOUT</span><h2>{todaySession.label} {todaySession.context?.durationMinutes && <small>{todaySession.context.durationMinutes}분</small>}</h2><p>{todaySession.exercises.length ? todaySession.exercises.slice(0, 3).map((item) => item.target).join(" · ") : "운동 전에 시간과 장소를 선택하세요"}</p></div>
        {todaySession.status !== "complete" && <><button className="primary-button compact-button" onClick={onStartWorkout}>{todaySession.status === "partial" ? "계속" : "운동 준비"}</button>{!hasStartedSession(todaySession) && <button className="text-button postpone-link" onClick={onPostponeWorkout}>하루 미루기</button>}{todaySession.exercises.length > 0 && <button className="text-button routine-link" onClick={onOpenRoutine}>순서·종목 편집</button>}</>}
      </section>}

      <section className="card home-running-card"><div className="brief-icon"><Footprints size={22} /></div><div className="brief-copy"><span className="eyebrow">러닝</span><h2>{runningSuggestion ? (runningSuggestion.plan?.type === "interval" ? "250m 인터벌 4회" : "이지런 25분") : "오늘 러닝 직접 설정"}</h2><p>{runningSuggestion ? runningSuggestion.pplType + " 일정에 맞춘 러닝 추천" : "오늘은 추천이 없어도 원하는 방식으로 시작할 수 있어요."}</p></div><button className="secondary-button compact-button" onClick={onOpenRunning}>열기</button></section>

      <section className="card meal-timeline">
        <div className="section-heading compact"><div><span className="eyebrow">하루 기록</span><h2>운동과 식사</h2></div><button className="text-button" onClick={onOpenMeals}>식사 탭 열기</button></div>
        <div className="meal-entry-list">{timeline.length ? timeline.map((entry, index) => <div className={`timeline-entry ${entry.type}`} key={`${entry.at}-${index}`}><time>{new Date(entry.at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</time><div><strong>{entry.label}</strong><span>{entry.detail}</span></div></div>) : <p className="empty-copy">아직 기록이 없습니다.</p>}</div>
      </section>

      {detailsOpen && <Modal title={`${month}월 ${day}일 운동`} onClose={() => { setDetailsOpen(false); setDeleteConfirm(false); }}>
        {(completed || planned) ? <div className="preview-list">{(completed || planned).exercises.map((item, index) => <div key={`${item.id}-${index}`}><span>{index + 1}</span><strong>{item.name}</strong><small>{item.completedSets?.length || 0}/{item.sets}세트</small></div>)}</div> : <p>운동 기록이 없습니다.</p>}
        {completed && <div className="workout-delete-panel">{deleteConfirm ? <><p>이 날짜의 운동 세트와 완료 기록을 모두 삭제할까요?</p><div><button className="danger-button" onClick={() => { onDeleteWorkout(selectedDate); setDetailsOpen(false); setDeleteConfirm(false); }}>운동 기록 삭제 확정</button><button className="secondary-button" onClick={() => setDeleteConfirm(false)}>취소</button></div></> : <button className="danger-button" onClick={() => setDeleteConfirm(true)}>운동 기록 삭제</button>}</div>}
        <button className="primary-button" onClick={() => { setDetailsOpen(false); setDeleteConfirm(false); }}>닫기</button>
      </Modal>}
    </div>
  );
}
