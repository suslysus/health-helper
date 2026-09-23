import { ChevronLeft, ChevronRight, Dumbbell } from "lucide-react";
import { useState } from "react";
import { SPLITS } from "../lib/program";
import Modal from "./Modal";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const keyFor = (year, month, day) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export default function HomeScreen({ selectedDate, setSelectedDate, session, todaySession, history, drafts, todayDate, plan, onStartWorkout, onOpenRoutine }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [year, month, day] = selectedDate.split("-").map(Number);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const dayCount = new Date(year, month, 0).getDate();
  const completed = history.find((item) => item.date === selectedDate);
  const planned = drafts[selectedDate] || (selectedDate === todayDate && !completed ? session : null);
  const dayExerciseCount = completed?.exercises.length ?? planned?.exercises.length;

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
            const drafted = !recorded && (Boolean(drafts[date]) || date === todayDate);
            const state = recorded?.status === "complete" ? "complete" : recorded?.status === "partial" ? "partial" : drafted ? "planned" : null;
            return <button key={date} className={`calendar-day ${selectedDate === date ? "selected" : ""}`} onClick={() => setSelectedDate(date)} aria-label={`${month}월 ${index + 1}일 ${state === "complete" ? "운동 완료" : state === "partial" ? "일부 기록" : state === "planned" ? "운동 예정" : "기록 없음"}`}>
              <span>{index + 1}</span>{state && <i className={`day-dot ${state}`} />}
            </button>;
          })}
        </div>
        <div className="calendar-legend"><span><i className="legend-dot complete" />완료</span><span><i className="legend-dot partial" />일부 기록</span><span><i className="legend-dot planned" />예정</span></div>
      </section>

      <section className="card day-summary-card">
        <div className="section-heading compact"><div><span className="eyebrow">SELECTED DAY</span><h2>{month}월 {day}일</h2></div><button className="text-button" onClick={() => setDetailsOpen(true)}>자세히</button></div>
        <dl className="summary-list">
          <div><dt>운동</dt><dd>{completed ? `${completed.label} ${completed.status === "partial" ? "일부 기록" : "완료"}` : planned ? `${planned.label} ${planned.exercises.length ? "예정" : "준비 전"}` : "기록 없음"}</dd></div>
          <div><dt>운동 방식</dt><dd>{SPLITS[plan.split]?.label} · {SPLITS[plan.split]?.sessions.length}회 순환</dd></div>
          <div><dt>운동 종목</dt><dd>{dayExerciseCount == null ? "기록 없음" : dayExerciseCount ? `${dayExerciseCount}개` : "준비 전"}</dd></div>
        </dl>
      </section>

      {todaySession && <section className="card workout-brief">
        <div className="brief-icon"><Dumbbell size={22} /></div>
        <div className="brief-copy"><span className="eyebrow">TODAY'S WORKOUT</span><h2>{todaySession.label} {todaySession.context?.durationMinutes && <small>{todaySession.context.durationMinutes}분</small>}</h2><p>{todaySession.exercises.length ? todaySession.exercises.slice(0, 3).map((item) => item.target).join(" · ") : "운동 전에 시간과 장소를 선택하세요"}</p></div>
        {todaySession.status !== "complete" && <><button className="primary-button compact-button" onClick={onStartWorkout}>{todaySession.status === "partial" ? "계속" : "운동 준비"}</button>{todaySession.exercises.length > 0 && <button className="text-button routine-link" onClick={onOpenRoutine}>구성 수정</button>}</>}
      </section>}

      {detailsOpen && <Modal title={`${month}월 ${day}일 운동`} onClose={() => setDetailsOpen(false)}>
        {(completed || planned) ? <div className="preview-list">{(completed || planned).exercises.map((item, index) => <div key={`${item.id}-${index}`}><span>{index + 1}</span><strong>{item.name}</strong><small>{item.completedSets?.length || 0}/{item.sets}세트</small></div>)}</div> : <p>운동 기록이 없습니다.</p>}
        <button className="primary-button" onClick={() => setDetailsOpen(false)}>닫기</button>
      </Modal>}
    </div>
  );
}
