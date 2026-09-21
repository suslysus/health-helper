import { ChevronLeft, Clock3, Dumbbell, MapPin, MoreHorizontal, Plus, Minus, TimerReset } from "lucide-react";
import { useEffect, useState } from "react";
import { workoutExercises } from "../data";
import Modal from "./Modal";

function formatTime(total) {
  const minutes = Math.floor(total / 60).toString().padStart(2, "0");
  const seconds = (total % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function WorkoutScreen({ mode, setMode, onBackHome }) {
  const [weight, setWeight] = useState(45);
  const [reps, setReps] = useState(9);
  const [rir, setRir] = useState(1);
  const [sheet, setSheet] = useState(null);
  const [restSeconds, setRestSeconds] = useState(150);
  const [timerRunning, setTimerRunning] = useState(false);
  const [setNumber, setSetNumber] = useState(2);
  const [exerciseIndex, setExerciseIndex] = useState(1);
  const [alternative, setAlternative] = useState("");
  const [feedback, setFeedback] = useState("");
  const exercise = workoutExercises[exerciseIndex];

  useEffect(() => {
    if (!timerRunning || restSeconds <= 0) return undefined;
    const timer = window.setInterval(() => setRestSeconds((value) => value - 1), 1000);
    return () => window.clearInterval(timer);
  }, [timerRunning, restSeconds]);

  const completeSet = () => {
    setRestSeconds(150);
    setTimerRunning(true);
    setSheet("rest");
  };

  if (mode === "overview") {
    return (
      <div className="screen">
        <section className="card workout-overview-card">
          <span className="eyebrow">TODAY</span>
          <div className="overview-title-row">
            <h1>PUSH</h1>
            <span className="count-pill">6개 운동</span>
          </div>
          <p>가슴 · 어깨 · 삼두</p>
          <div className="overview-meta">
            <span><MapPin size={16} />OO 헬스장</span>
            <span><Clock3 size={16} />약 70분</span>
          </div>
          <button className="primary-button" onClick={() => setMode("prepare")}>운동 준비</button>
        </section>

        <section className="card history-card">
          <div className="section-heading compact"><h2>최근 운동</h2></div>
          {["9/19  PULL", "9/17  LEGS", "9/15  PUSH"].map((item, index) => (
            <div className="history-row" key={item}>
              <strong>{item}</strong>
              <span>{[12, 14, 13][index]}세트 · {[58, 65, 62][index]}분</span>
            </div>
          ))}
        </section>
      </div>
    );
  }

  if (mode === "prepare") {
    return (
      <div className="screen full-screen-flow">
        <div className="flow-header">
          <button className="icon-button" onClick={() => setMode("overview")} aria-label="뒤로">
            <ChevronLeft />
          </button>
          <h1>운동 준비</h1>
          <span className="header-spacer" />
        </div>

        <section className="card location-card">
          <span className="eyebrow">LOCATION</span>
          <div className="select-row static-row"><MapPin size={18} />OO 헬스장</div>
        </section>

        <section className="card program-card">
          <div className="section-heading compact">
            <div><span className="eyebrow">PROGRAM</span><h2>PUSH</h2></div>
            <span className="count-pill">약 70분</span>
          </div>
          <details className="adjustment-details">
            <summary>오늘 조정 내용</summary>
            <p>Hammer Press 중량 유지 · 나머지 구성 동일</p>
          </details>
        </section>

        <section className="card exercise-list-card">
          <h2>운동 목록</h2>
          {workoutExercises.map((exercise, index) => (
            <div className="exercise-row" key={exercise.name}>
              <span className="exercise-index">{index + 1}</span>
              <div><strong>{exercise.name}</strong><small>{exercise.target} · {exercise.sets}세트 × {exercise.reps}회</small></div>
              <b>{exercise.weight}kg</b>
            </div>
          ))}
        </section>

        <div className="sticky-action">
          <button className="primary-button" onClick={() => setMode("active")}>운동 시작</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen workout-active-screen">
      <div className="session-header">
        <button className="icon-button" onClick={() => setSheet("flow")} aria-label="운동 흐름 열기">
          <Dumbbell size={20} />
        </button>
        <div><span>PUSH</span><strong>{exerciseIndex + 1} / {workoutExercises.length}</strong></div>
        <button className="icon-button" onClick={() => setSheet("more")} aria-label="더보기">
          <MoreHorizontal />
        </button>
      </div>

      <section className="exercise-hero">
        <span className="eyebrow">CURRENT EXERCISE · SET {setNumber}/3</span>
        <h1>{exercise.name}</h1>
        <p>{exercise.target}</p>
        <div className="recommendation-line">권장 {exercise.weight}kg · {exercise.reps}회 · RIR 1~2</div>
      </section>

      {setNumber > 1 && (
        <section className="previous-set">
          <span className="check-mark">✓</span>
          <strong>SET {setNumber - 1}</strong>
          <span>{weight}kg × {reps}회</span>
          <small>RIR {rir}</small>
        </section>
      )}

      <section className="entry-stack">
        <Counter label="실제 중량" unit="kg" value={weight} onDecrease={() => setWeight(Math.max(0, weight - 2.5))} onIncrease={() => setWeight(weight + 2.5)} />
        <Counter label="실제 반복수" unit="회" value={reps} onDecrease={() => setReps(Math.max(0, reps - 1))} onIncrease={() => setReps(reps + 1)} />
        <div className="rir-control">
          <div className="control-label"><span>RIR</span><small>남은 반복 여력</small></div>
          <div className="rir-options">
            {[0, 1, 2, 3, 4, 5].map((value) => (
              <button key={value} className={rir === value ? "selected" : ""} onClick={() => setRir(value)}>{value}</button>
            ))}
          </div>
        </div>
      </section>

      <details className="set-details card">
        <summary>세트 상세 기록</summary>
        <div className="chip-grid">
          {["마지막 반복 정지", "수축 강조", "네거티브 강조", "실패", "보조자 도움", "통증 발생"].map((item) => (
            <label key={item}><input type="checkbox" />{item}</label>
          ))}
        </div>
        <textarea placeholder="메모를 남겨보세요" />
      </details>

      <div className="sticky-action active-action">
        <button className="primary-button" onClick={completeSet}>세트 완료</button>
      </div>

      {sheet === "flow" && (
        <Modal title="PUSH 운동 흐름" onClose={() => setSheet(null)} className="flow-sheet">
          <div className="flow-list">
            {workoutExercises.map((exercise, index) => (
              <button key={exercise.name} className={index === exerciseIndex ? "current" : ""} onClick={() => {
                setExerciseIndex(index);
                setWeight(exercise.weight);
                setReps(Number.parseInt(exercise.reps, 10));
                setSetNumber(1);
                setSheet(null);
              }}>
                <span>{exercise.done ? "✓" : index + 1}</span>
                <div><strong>{exercise.name}</strong><small>{exercise.target}</small></div>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {sheet === "more" && (
        <Modal title="운동 옵션" onClose={() => setSheet(null)}>
          <div className="sheet-menu">
            <button onClick={() => setSheet("equipment")}>기구 사용 중</button>
            <button onClick={() => setSheet("feedback")}>운동 피드백</button>
            <button onClick={() => { setSheet(null); setMode("overview"); onBackHome(); }}>운동 종료</button>
          </div>
        </Modal>
      )}

      {sheet === "equipment" && (
        <Modal title="대체 운동 선택" onClose={() => setSheet(null)}>
          <p className="sheet-description">현재 기구를 사용할 수 없을 때 순서를 바꾸거나 비슷한 운동으로 교체할 수 있습니다.</p>
          <div className="option-list">
            {["Lateral Raise 먼저", "Rear Delt Fly 먼저", "Machine Press", "Smith Press", "Dumbbell Press"].map((option) => (
              <label key={option}><input type="radio" name="alternative" checked={alternative === option} onChange={() => setAlternative(option)} /> <span>{option}</span></label>
            ))}
          </div>
          <button className="primary-button" disabled={!alternative} onClick={() => setSheet(null)}>오늘만 변경</button>
        </Modal>
      )}

      {sheet === "feedback" && (
        <Modal title="운동 피드백" onClose={() => setSheet(null)}>
          <div className="option-list feedback-options">
            {["너무 가벼움", "적절함", "무거움", "수행 불안정", "통증 있음"].map((option) => (
              <label key={option}><input type="radio" name="feedback" checked={feedback === option} onChange={() => setFeedback(option)} /> <span>{option}</span></label>
            ))}
          </div>
          <textarea placeholder="필요한 내용만 간단히 기록하세요" />
          <button className="primary-button" disabled={!feedback} onClick={() => setSheet(null)}>저장</button>
        </Modal>
      )}

      {sheet === "rest" && (
        <Modal title="다음 세트까지 휴식" onClose={() => { setSheet(null); setTimerRunning(false); }} className="rest-sheet">
          <div className="rest-timer">{formatTime(restSeconds)}</div>
          <p className="next-set">{exercise.name} · SET {Math.min(setNumber + 1, 3)} · {weight}kg · {exercise.reps}회</p>
          <div className="timer-actions">
            <button onClick={() => setTimerRunning((value) => !value)}><TimerReset size={18} />{timerRunning ? "일시정지" : "계속"}</button>
            <button onClick={() => setRestSeconds((value) => value + 30)}>+30초</button>
            <button onClick={() => { setSetNumber(Math.min(3, setNumber + 1)); setTimerRunning(false); setSheet(null); }}>건너뛰기</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Counter({ label, unit, value, onDecrease, onIncrease }) {
  return (
    <div className="counter-control">
      <div className="control-label"><span>{label}</span><small>{unit}</small></div>
      <div className="counter-box">
        <button onClick={onDecrease} aria-label={`${label} 감소`}><Minus size={18} /></button>
        <strong>{value}</strong>
        <button onClick={onIncrease} aria-label={`${label} 증가`}><Plus size={18} /></button>
      </div>
    </div>
  );
}
