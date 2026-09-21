import { Dumbbell } from "lucide-react";
import { useState } from "react";
import { calendarDays, dayRecords } from "../data";
import Modal from "./Modal";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

export default function HomeScreen({ selectedDay, setSelectedDay, onStartWorkout, onOpenRoutine }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const record = dayRecords[selectedDay] ?? {
    workout: "기록 없음",
    meal: "기록 없음",
    sleep: "기록 없음",
    weight: "기록 없음",
    status: "empty",
  };

  return (
    <div className="screen home-screen">
      <section className="calendar-card card priority-card">
        <div className="calendar-heading">
          <div>
            <span className="eyebrow">CALENDAR</span>
            <h2>2026년 9월</h2>
          </div>
        </div>

        <div className="calendar-grid weekday-row">
          {weekdays.map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="calendar-grid days-grid">
          <span />
          <span />
          {calendarDays.map((day) => {
            const status = dayRecords[day]?.status ?? "empty";
            return (
              <button
                key={day}
                className={`calendar-day ${selectedDay === day ? "selected" : ""}`}
                onClick={() => setSelectedDay(day)}
                aria-label={`9월 ${day}일 ${status === "complete" ? "기록 완료" : status === "partial" ? "일부 기록" : "기록 없음"}`}
              >
                <span>{day}</span>
                {status !== "empty" && <i className={`day-dot ${status}`} />}
              </button>
            );
          })}
        </div>
        <div className="calendar-legend">
          <span><i className="legend-dot complete" />완료</span>
          <span><i className="legend-dot partial" />일부 기록</span>
        </div>
      </section>

      <section className="card day-summary-card">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">SELECTED DAY</span>
            <h2>9월 {selectedDay}일</h2>
          </div>
          <button className="text-button" onClick={() => setDetailsOpen(true)}>자세히</button>
        </div>
        <dl className="summary-list">
          <div><dt>운동</dt><dd>{record.workout}</dd></div>
          <div><dt>식사</dt><dd>{record.meal}</dd></div>
          <div><dt>수면</dt><dd>{record.sleep}</dd></div>
          <div><dt>체중</dt><dd className={record.weight.includes("미") ? "subtle" : ""}>{record.weight}</dd></div>
        </dl>
      </section>

      <section className="card workout-brief">
        <div className="brief-icon"><Dumbbell size={22} /></div>
        <div className="brief-copy">
          <span className="eyebrow">TODAY'S WORKOUT</span>
          <h2>PUSH <small>약 70분</small></h2>
          <p>가슴 · 어깨 · 삼두</p>
        </div>
        <button className="primary-button compact-button" onClick={onStartWorkout}>시작</button>
        <button className="text-button routine-link" onClick={onOpenRoutine}>구성 수정</button>
      </section>

      {detailsOpen && (
        <Modal title={`9월 ${selectedDay}일 기록`} onClose={() => setDetailsOpen(false)}>
          <dl className="summary-list detail-summary">
            <div><dt>운동</dt><dd>{record.workout}</dd></div>
            <div><dt>식사</dt><dd>{record.meal}</dd></div>
            <div><dt>수면</dt><dd>{record.sleep}</dd></div>
            <div><dt>체중</dt><dd>{record.weight}</dd></div>
          </dl>
          <button className="primary-button" onClick={() => setDetailsOpen(false)}>확인</button>
        </Modal>
      )}
    </div>
  );
}
