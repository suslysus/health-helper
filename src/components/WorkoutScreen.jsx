import { ChevronLeft, Clock3, Dumbbell, Minus, MoreHorizontal, Plus, TimerReset } from "lucide-react";
import { useEffect, useState } from "react";
import Modal from "./Modal";
import { SPLITS } from "../lib/program";

const timeLabel = (total) => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

export default function WorkoutScreen({ mode, setMode, session, plan, onChange, onChangeType, onFinish, onEditSession, onOpenProgram, onBackHome }) {
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(8);
  const [rir, setRir] = useState(2);
  const [sheet, setSheet] = useState(null);
  const [restSeconds, setRestSeconds] = useState(120);
  const [timerRunning, setTimerRunning] = useState(false);
  const exercise = session?.exercises[Math.min(exerciseIndex, Math.max(session.exercises.length - 1, 0))];
  const completedSets = session?.exercises.reduce((sum, item) => sum + (item.completedSets?.length || 0), 0) || 0;
  const totalSets = session?.exercises.reduce((sum, item) => sum + item.sets, 0) || 0;

  useEffect(() => {
    setWeight(exercise?.completedSets?.at(-1)?.weight ?? 0);
    setReps(exercise?.completedSets?.at(-1)?.reps ?? Number.parseInt(exercise?.reps || "8", 10));
    setRir(exercise?.completedSets?.at(-1)?.rir ?? 2);
  }, [exercise?.id]);

  useEffect(() => {
    if (!timerRunning || restSeconds <= 0) return undefined;
    const timer = window.setInterval(() => setRestSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [timerRunning, restSeconds]);

  if (!session || !exercise) return <div className="screen"><p>오늘 구성할 운동이 없습니다.</p><button className="secondary-button" onClick={onEditSession}>운동 추가</button></div>;

  const nextIncompleteIndex = (updated) => updated.exercises.findIndex((item) => (item.completedSets?.length || 0) < item.sets);

  const completeSet = () => {
    const next = {
      ...session,
      exercises: session.exercises.map((item, index) => index === exerciseIndex
        ? { ...item, completedSets: [...(item.completedSets || []), { weight, reps, rir, at: new Date().toISOString() }] }
        : item),
    };
    onChange(next);
    setRestSeconds(120);
    setTimerRunning(true);
    setSheet(nextIncompleteIndex(next) === -1 ? "finished" : "rest");
  };

  const goNext = () => {
    const index = nextIncompleteIndex(session);
    setTimerRunning(false);
    setSheet(null);
    if (index >= 0) setExerciseIndex(index);
  };

  if (mode === "overview") return <div className="screen">
    <section className="card workout-overview-card"><span className="eyebrow">TODAY</span><div className="overview-title-row"><h1>{session.label}</h1><span className="count-pill">{session.exercises.length}개 운동</span></div><p>종목은 운동할 때마다 바꿀 수 있습니다.</p><div className="overview-meta"><span><Clock3 size={16} />{completedSets}/{totalSets}세트 기록</span></div>{session.status === "complete" ? <p>오늘 운동을 완료했습니다.</p> : <button className="primary-button" onClick={() => setMode("prepare")}>운동 준비</button>}</section>
    <section className="card exercise-list-card"><h2>오늘 운동</h2>{session.exercises.map((item, index) => <div className="exercise-row" key={`${item.id}-${index}`}><span className="exercise-index">{index + 1}</span><div><strong>{item.name}</strong><small>{item.target} · {item.sets}세트 × {item.reps}회</small></div><b>{item.completedSets?.length || 0}/{item.sets}</b></div>)}</section>
  </div>;

  if (mode === "prepare") return <div className="screen full-screen-flow">
    <div className="flow-header"><button className="icon-button" onClick={() => setMode("overview")} aria-label="뒤로"><ChevronLeft /></button><h1>운동 준비</h1><span className="header-spacer" /></div>
    <section className="card program-card"><span className="eyebrow">TODAY'S PLAN</span><h2>{session.label}</h2><p>오늘 컨디션에 맞춰 운동 종류와 종목을 바꿀 수 있습니다.</p><label className="session-type-label">오늘 운동 종류<select value={session.label} onChange={(event) => onChangeType(event.target.value)}>{SPLITS[plan.split].sessions.map((type) => <option key={type}>{type}</option>)}</select></label><button className="text-button" onClick={onOpenProgram}>AI로 수정 방향 적기</button></section>
    <section className="card exercise-list-card"><div className="section-heading"><h2>운동 목록</h2><button className="text-button" onClick={onEditSession}>직접 수정</button></div>{session.exercises.map((item, index) => <div className="exercise-row" key={`${item.id}-${index}`}><span className="exercise-index">{index + 1}</span><div><strong>{item.name}</strong><small>{item.target} · {item.sets}세트 × {item.reps}회</small></div><b>{item.equipment}</b></div>)}</section>
    <div className="sticky-action"><button className="primary-button" onClick={() => { setExerciseIndex(Math.max(0, nextIncompleteIndex(session))); setMode("active"); }}>운동 시작</button></div>
  </div>;

  return <div className="screen workout-active-screen">
    <div className="session-header"><button className="icon-button" onClick={() => setSheet("flow")} aria-label="운동 흐름 열기"><Dumbbell size={20} /></button><div><span>{session.label}</span><strong>{completedSets} / {totalSets} 세트</strong></div><button className="icon-button" onClick={() => setSheet("more")} aria-label="더보기"><MoreHorizontal /></button></div>
    <section className="exercise-hero"><span className="eyebrow">CURRENT EXERCISE · SET {Math.min((exercise.completedSets?.length || 0) + 1, exercise.sets)}/{exercise.sets}</span><h1>{exercise.name}</h1><p>{exercise.target} · {exercise.equipment}</p><div className="recommendation-line">권장 {exercise.reps}회 · RIR 1~3</div></section>
    {(exercise.completedSets?.length || 0) > 0 && <section className="previous-set"><span className="check-mark">✓</span><strong>직전 세트</strong><span>{exercise.completedSets.at(-1).weight}kg × {exercise.completedSets.at(-1).reps}회</span><small>RIR {exercise.completedSets.at(-1).rir}</small></section>}
    <section className="entry-stack"><Counter label="실제 중량" unit="kg" value={weight} step={2.5} onChange={setWeight} /><Counter label="실제 반복수" unit="회" value={reps} step={1} onChange={setReps} /><div className="rir-control"><div className="control-label"><span>RIR</span><small>남은 반복 여력</small></div><div className="rir-options">{[0,1,2,3,4,5].map((value) => <button key={value} className={rir === value ? "selected" : ""} onClick={() => setRir(value)}>{value}</button>)}</div></div></section>
    <div className="sticky-action active-action"><button className="primary-button" disabled={(exercise.completedSets?.length || 0) >= exercise.sets} onClick={completeSet}>세트 완료</button></div>

    {sheet === "flow" && <Modal title="운동 흐름" onClose={() => setSheet(null)}><div className="flow-list">{session.exercises.map((item, index) => <button key={`${item.id}-${index}`} className={index === exerciseIndex ? "current" : ""} onClick={() => { setExerciseIndex(index); setSheet(null); }}><span>{index + 1}</span><div><strong>{item.name}</strong><small>{item.completedSets?.length || 0}/{item.sets}세트 · {item.target}</small></div></button>)}</div></Modal>}
    {sheet === "more" && <Modal title="운동 옵션" onClose={() => setSheet(null)}><div className="sheet-menu"><button onClick={() => { setSheet(null); onEditSession(); }}>오늘 종목 수정</button><button onClick={() => { setSheet(null); onOpenProgram(); }}>AI로 수정 방향 적기</button><button onClick={() => { setSheet(null); setMode("overview"); onBackHome(); }}>잠시 중단</button><button onClick={() => { setSheet(null); onFinish(session, "partial"); }}>여기까지 기록하고 종료</button></div></Modal>}
    {sheet === "rest" && <Modal title="다음 세트까지 휴식" onClose={goNext}><div className="rest-timer">{timeLabel(restSeconds)}</div><p className="next-set">다음 운동은 기록된 순서대로 진행합니다.</p><div className="timer-actions"><button onClick={() => setTimerRunning((running) => !running)}><TimerReset size={18} />{timerRunning ? "일시정지" : "계속"}</button><button onClick={() => setRestSeconds((seconds) => seconds + 30)}>+30초</button><button onClick={goNext}>다음 세트</button></div></Modal>}
    {sheet === "finished" && <Modal title="오늘 운동 완료" onClose={() => setSheet(null)}><p>{session.exercises.length}개 운동, {totalSets}세트를 기록했습니다.</p><button className="primary-button" onClick={() => { setSheet(null); onFinish(session, "complete"); }}>기록 저장하고 종료</button></Modal>}
  </div>;
}

function Counter({ label, unit, value, step, onChange }) {
  return <div className="counter-control"><div className="control-label"><span>{label}</span><small>{unit}</small></div><div className="counter-box"><button onClick={() => onChange(Math.max(0, value - step))} aria-label={`${label} 감소`}><Minus size={18} /></button><strong>{value}</strong><button onClick={() => onChange(value + step)} aria-label={`${label} 증가`}><Plus size={18} /></button></div></div>;
}
