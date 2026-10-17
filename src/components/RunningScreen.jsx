import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Flag, MapPin, Pause, Play, Square, Timer } from "lucide-react";

const fmtTime = (ms = 0) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return String(Math.floor(s / 3600)).padStart(2, "0") + ":" + String(Math.floor(s / 60) % 60).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
};
const fmtDistance = (m = 0) => m >= 1000 ? (m / 1000).toFixed(2) + " km" : Math.round(m) + " m";
const fmtPace = (ms = 0, m = 0) => {
  if (!m) return "—";
  const s = Math.round(ms / 1000 / (m / 1000));
  return Math.floor(s / 60) + "′" + String(s % 60).padStart(2, "0") + "″";
};
const dateKey = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};
function planFor(kind, targetType, targetValue, repetitions, recovery, workType, workValue, mode) {
  const value = Number(targetValue);
  if (kind === "interval") {
    const work = Number(workValue);
    const useTime = workType === "time" || mode === "treadmill";
    return { type: "interval", targetDistanceMeters: 1000, targetDurationSeconds: 0, targetPaceSecondsPerKm: 0, workDistanceMeters: useTime ? 0 : (work || 250), workDurationSeconds: useTime ? (mode === "treadmill" && workType !== "time" ? 60 : (work || 60)) : 0, recoveryDurationSeconds: Math.max(10, Number(recovery) || 60), repetitions: Math.max(1, Math.min(20, Number(repetitions) || 4)), autoLapDistanceMeters: 0 };
  }
  return { type: "easy", targetDistanceMeters: targetType === "distance" ? (value || 5) * 1000 : 0, targetDurationSeconds: targetType === "time" ? (value || 25) * 60 : 0, targetPaceSecondsPerKm: targetType === "pace" ? Math.round((value || 6) * 60) : 0, workDistanceMeters: 0, workDurationSeconds: 0, recoveryDurationSeconds: 0, repetitions: 0, autoLapDistanceMeters: 1000 };
}
function trackPath(track = []) {
  const points = track.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)).slice(-400);
  if (points.length < 2) return "";
  const lats = points.map((point) => point.latitude), lngs = points.map((point) => point.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const spanLat = Math.max(maxLat - minLat, 0.00001), spanLng = Math.max(maxLng - minLng, 0.00001);
  return points.map((point, index) => ((index && points[index - 1].segment !== point.segment) ? "M" : index ? "L" : "M") + (5 + ((point.longitude - minLng) / spanLng) * 90).toFixed(1) + "," + (5 + (1 - (point.latitude - minLat) / spanLat) * 50).toFixed(1)).join(" ");
}
function LapDetails({ laps = [], mode }) {
  return laps.length ? <div className="lap-table-wrap"><table className="lap-table"><thead><tr><th>랩</th><th>구간</th><th>거리</th><th>시간</th></tr></thead><tbody>{[...laps].reverse().map((lap) => <tr key={lap.index + "-" + lap.totalElapsedMs}><td>{lap.index}</td><td>{lap.kind === "auto" ? "1km 자동" : lap.kind === "work" ? "빠르게" : lap.kind === "recovery" ? "회복" : "수동"}</td><td>{mode === "treadmill" && !(lap.distanceMeters > 0) ? "—" : fmtDistance(lap.distanceMeters)}</td><td>{fmtTime(lap.elapsedMs)}</td></tr>)}</tbody></table></div> : <p className="empty-copy">저장된 랩이 없습니다.</p>;
}
function goalLabel(plan = {}) {
  if (plan.type === "interval") {
    const work = plan.workDurationSeconds > 0 ? plan.workDurationSeconds + "초" : (plan.workDistanceMeters || 250) + "m";
    return work + " 빠르게 × " + (plan.repetitions || 4) + "회 · 회복 " + (plan.recoveryDurationSeconds || 60) + "초";
  }
  if (plan.targetDurationSeconds > 0) return "시간 " + (plan.targetDurationSeconds / 60) + "분";
  if (plan.targetDistanceMeters > 0) return "거리 " + (plan.targetDistanceMeters / 1000).toFixed(1) + "km";
  if (plan.targetPaceSecondsPerKm > 0) {
    const minutes = Math.floor(plan.targetPaceSecondsPerKm / 60);
    const seconds = String(plan.targetPaceSecondsPerKm % 60).padStart(2, "0");
    return "페이스 " + minutes + "′" + seconds + "″/km";
  }
  return "목표 직접 설정";
}

export default function RunningScreen({ session, history = [], recommendation, adapterError, onStart, onPause, onResume, onLap, onFinish, onDelete }) {
  const recKind = recommendation?.plan?.type === "interval" ? "interval" : "easy";
  const [kind, setKind] = useState(recKind);
  const [mode, setMode] = useState("outdoor");
  const [targetType, setTargetType] = useState("time");
  const [targetValue, setTargetValue] = useState("25");
  const [repetitions, setRepetitions] = useState("4");
  const [recovery, setRecovery] = useState("60");
  const [workType, setWorkType] = useState("distance");
  const [workValue, setWorkValue] = useState("250");
  const [manualKm, setManualKm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(null);
  const [dismissedFinishedId, setDismissedFinishedId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [expandedRunId, setExpandedRunId] = useState(null);
  const [now, setNow] = useState(Date.now());
  const formEditedRef = useRef(false);
  const recommendationKey = JSON.stringify(recommendation || null);
  const appliedRecommendationKeyRef = useRef(recommendationKey);
  const markEdited = () => { formEditedRef.current = true; };
  useEffect(() => {
    if (appliedRecommendationKeyRef.current === recommendationKey) return;
    appliedRecommendationKeyRef.current = recommendationKey;
    if (formEditedRef.current) return;
    if (!recommendation) {
      setKind("easy"); setMode("outdoor"); setTargetType("time"); setTargetValue("25");
      setRepetitions("4"); setRecovery("60"); setWorkType("distance"); setWorkValue("250");
      return;
    }
    const plan = recommendation.plan || {};
    setKind(plan.type === "interval" ? "interval" : "easy");
    setMode(recommendation.mode === "treadmill" ? "treadmill" : "outdoor");
    setRepetitions(String(plan.repetitions || 4));
    setRecovery(String(plan.recoveryDurationSeconds || 60));
    if (plan.type === "interval") {
      setWorkType(plan.workDurationSeconds > 0 ? "time" : "distance");
      setWorkValue(String(plan.workDurationSeconds > 0 ? plan.workDurationSeconds : plan.workDistanceMeters || 250));
    } else if (plan.targetDistanceMeters > 0) {
      setTargetType("distance"); setTargetValue(String(plan.targetDistanceMeters / 1000));
    } else if (plan.targetPaceSecondsPerKm > 0) {
      setTargetType("pace"); setTargetValue(String(plan.targetPaceSecondsPerKm / 60));
    } else {
      setTargetType("time"); setTargetValue(String((plan.targetDurationSeconds || 1500) / 60));
    }
  }, [recommendationKey]);
  useEffect(() => {
    if (session?.status !== "running") return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session?.status, session?.id]);
  const plan = useMemo(() => planFor(kind, targetType, targetValue, repetitions, recovery, workType, workValue, mode), [kind, targetType, targetValue, repetitions, recovery, workType, workValue, mode]);
  const act = async (fn, ...args) => {
    if (!fn || busy) return null;
    setBusy(true); setError("");
    try { return await fn(...args); }
    catch (e) { setError(e?.message || "러닝을 처리하지 못했습니다. 위치 권한과 GPS 상태를 확인해 주세요."); return null; }
    finally { setBusy(false); }
  };
  const start = async () => {
    const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
    if (kind === "easy") {
      const target = Number(targetValue);
      const max = targetType === "time" ? 360 : targetType === "distance" ? 100 : 60;
      if (!positive(target) || target > max) { setError(targetType === "time" ? "러닝 시간은 1~360분으로 입력해 주세요." : targetType === "distance" ? "러닝 거리는 1~100km로 입력해 주세요." : "목표 페이스는 1~60분/km로 입력해 주세요."); return; }
    }
    if (kind === "interval") {
      const reps = Number(repetitions), recoverySeconds = Number(recovery), work = Number(workValue);
      if (!Number.isInteger(reps) || reps < 1 || reps > 20) { setError("반복 횟수는 1~20회로 입력해 주세요."); return; }
      if (!Number.isFinite(recoverySeconds) || recoverySeconds < 10 || recoverySeconds > 900) { setError("회복 시간은 10~900초로 입력해 주세요."); return; }
      if (!Number.isFinite(work) || work <= 0 || (mode === "outdoor" && workType === "distance" && work < 50) || (mode === "outdoor" && workType === "distance" && work > 10000) || (workType === "time" && work > 3600)) { setError("빠른 구간 목표를 허용 범위 안에서 입력해 주세요."); return; }
    }
    const result = await act(onStart, { date: dateKey(), pplType: recommendation?.pplType || null, mode, plan });
    if (result?.session) { setFinished(null); setManualKm(""); }
  };
  const finish = async () => {
    const currentMode = active?.mode || mode;
    const km = Number(manualKm);
    if (currentMode === "treadmill" && manualKm.trim() && (!Number.isFinite(km) || km < 0)) { setError("러닝머신 거리는 0km 이상으로 입력해 주세요."); return; }
    if (currentMode === "treadmill" && manualKm.trim() && km > 100) { setError("러닝머신 거리는 100km 이하로 입력해 주세요."); return; }
    const result = await act(onFinish, { manualDistanceMeters: currentMode === "treadmill" && manualKm.trim() ? km * 1000 : undefined });
    if (result?.session?.status === "completed" && result.persisted === true) setFinished(result.session);
  };
  const active = session && session.status !== "completed" ? session : null;
  const shown = active || (finished?.id !== dismissedFinishedId ? finished : null) || (session?.status === "completed" && session.id !== dismissedFinishedId ? session : null);
  const recent = [...history].sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt))).slice(0, 8);
  const todayCount = history.filter((run) => run.date === dateKey()).length;
  const todayRuns = history.filter((run) => run.date === dateKey());
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weekStart = monday.getFullYear() + "-" + String(monday.getMonth() + 1).padStart(2, "0") + "-" + String(monday.getDate()).padStart(2, "0");
  const weekRuns = history.filter((run) => run.date >= weekStart && run.date <= dateKey());
  const todayMeters = todayRuns.reduce((sum, run) => sum + (Number(run.distanceMeters) || 0), 0);
  const weekMeters = weekRuns.reduce((sum, run) => sum + (Number(run.distanceMeters) || 0), 0);
  const weekElapsed = weekRuns.reduce((sum, run) => sum + (Number(run.elapsedMs) || 0), 0);
  const gps = shown?.mode === "treadmill" ? "러닝머신" : ({ active: "GPS 연결됨", poor: "GPS 신호 약함", waiting: "GPS 연결 중", unavailable: "GPS 사용 불가" }[shown?.gpsStatus] || "GPS 대기");
  const phase = ({ easy: "이지런", work: "빠르게", recovery: "회복", cooldown: "마무리" })[shown?.phase] || "러닝";
  const shownInterval = (shown?.plan?.type || shown?.plan?.kind) === "interval";
  const shownElapsed = shown?.status === "running" ? shown.elapsedMs + Math.max(0, now - Number(shown.clockAnchorMs || now)) : shown?.elapsedMs || 0;
  const deleteRun = (id) => {
    onDelete?.(id);
    if (finished?.id === id || (session?.status === "completed" && session.id === id)) {
      setFinished(null);
      setDismissedFinishedId(id);
    }
    setDeleteId(null);
  };

  return <div className="screen running-screen">
    <section className="running-heading"><span className="eyebrow">RUN TRACKER</span><h1>러닝</h1><p>오늘 컨디션에 맞춰 시작하고, 운동 기록과 별도로 저장합니다.</p>{adapterError && <p className="running-error" role="alert">{adapterError}</p>}{error && <p className="running-error" role="alert">{error}</p>}</section>
    <section className={"card running-recommendation" + (recommendation ? "" : " muted-recommendation")}><div><span className="eyebrow">오늘 추천{recommendation?.pplType ? " · " + recommendation.pplType : ""}</span><strong>{recommendation ? (recommendation.plan?.type === "interval" ? "250m 인터벌 4회" : "이지런 25분") : "회복 우선"}</strong><p>{recommendation ? "PPL 운동 순서는 그대로 유지돼요." : "추천은 없지만 직접 설정해 러닝을 시작할 수 있어요."}</p></div><span className="recommendation-mark"><Activity size={20} /></span></section>
    {!active && <section className="card running-setup" onChangeCapture={markEdited} onClickCapture={(event) => { if (event.target.closest(".running-choice")) markEdited(); }}>
      <div className="section-heading compact"><div><span className="eyebrow">새 러닝</span><h2>방식과 목표</h2></div><span className="run-count">오늘 {todayCount}회</span></div>
      <div className="running-choice-row" aria-label="러닝 종류"><button className={kind === "easy" ? "running-choice selected" : "running-choice"} onClick={() => setKind("easy")}>이지런</button><button className={kind === "interval" ? "running-choice selected" : "running-choice"} onClick={() => { setKind("interval"); if (mode === "treadmill") { setWorkType("time"); setWorkValue("60"); } }}>인터벌</button></div>
      <div className="running-choice-row mode-choice" aria-label="측정 방식"><button className={mode === "outdoor" ? "running-choice selected" : "running-choice"} onClick={() => setMode("outdoor")}><MapPin size={15} /> 야외 GPS</button><button className={mode === "treadmill" ? "running-choice selected" : "running-choice"} onClick={() => { setMode("treadmill"); if (kind === "interval") { setWorkType("time"); setWorkValue("60"); } }}><Activity size={15} /> 러닝머신</button></div>
      {kind === "easy" ? <div className="run-settings-grid"><label>목표 기준<select value={targetType} onChange={(e) => { const value = e.target.value; setTargetType(value); setTargetValue(value === "time" ? "25" : value === "distance" ? "5" : "6"); }}><option value="time">시간</option><option value="distance">거리</option><option value="pace">페이스</option></select></label><label>{targetType === "time" ? "목표 시간 (분)" : targetType === "distance" ? "목표 거리 (km)" : "목표 페이스 (분/km)"}<input type="number" min="1" step={targetType === "pace" ? "0.1" : "1"} value={targetValue} onChange={(e) => setTargetValue(e.target.value)} /></label></div> : <div className="run-settings-grid"><label>빠른 구간 목표<select disabled={mode === "treadmill"} value={workType} onChange={(e) => setWorkType(e.target.value)}><option value="distance">거리</option><option value="time">시간</option></select></label><label>{workType === "distance" && mode !== "treadmill" ? "거리 (m)" : "시간 (초)"}<input type="number" min="1" value={workValue} onChange={(e) => setWorkValue(e.target.value)} /></label><label>반복 횟수<input type="number" min="1" max="20" value={repetitions} onChange={(e) => setRepetitions(e.target.value)} /></label><label>회복 시간 (초)<input type="number" min="10" max="900" value={recovery} onChange={(e) => setRecovery(e.target.value)} /></label><p className="settings-hint">{mode === "treadmill" ? "러닝머신은 빠른 구간을 시간으로 진행합니다." : "빠른 구간 목표 뒤 회복하고 설정 횟수만큼 반복합니다."}</p></div>}
      <button className="primary-button running-start" disabled={busy} onClick={start}><Play size={17} fill="currentColor" />{busy ? "준비 중…" : "러닝 시작"}</button>
    </section>}
    {shown && <section className="card running-live">
      <div className="running-live-top"><span className={"gps-status " + (shown.gpsStatus || "unavailable")}><i />{gps}</span><span className="running-phase">{phase}{shown.phase === "work" && shownInterval ? " " + Number(shown.intervalIndex || 1) + "회" : ""}</span></div>
      <div className="running-target"><span>목표</span><strong>{goalLabel(shown.plan)}</strong></div>
      {shown.mode === "treadmill" && shownInterval && <p className="background-note">구간 전환은 화면에서 확인해 주세요. 앱이 백그라운드일 때 알림은 보장되지 않습니다.</p>}
      <div className="run-metrics"><div><small><Timer size={13} /> 경과 시간</small><strong>{fmtTime(shownElapsed)}</strong></div><div><small><MapPin size={13} /> 거리</small><strong>{fmtDistance(shown.distanceMeters)}</strong></div><div><small>평균 페이스</small><strong>{fmtPace(shownElapsed, shown.distanceMeters)}<em>/km</em></strong></div></div>
      {shown.accuracyMeters != null && shown.mode === "outdoor" && <p className="gps-accuracy">GPS 추정 정확도 약 {Math.round(shown.accuracyMeters)}m</p>}
      {active?.mode === "treadmill" && <label className="manual-distance">종료 시 러닝머신 거리 (km)<input type="number" min="0" step="0.1" placeholder="예: 5.2" value={manualKm} onChange={(e) => setManualKm(e.target.value)} /></label>}
      <div className="running-actions">{active?.status === "running" ? <button className="secondary-button" disabled={busy} onClick={() => act(onPause)}><Pause size={16} />일시정지</button> : active && <button className="secondary-button" disabled={busy} onClick={() => act(onResume)}><Play size={16} />이어달리기</button>}{active && <><button className="lap-button" disabled={busy || active.status !== "running"} onClick={() => act(onLap)}><Flag size={16} />랩</button><button className="finish-button" disabled={busy} onClick={finish}><Square size={15} fill="currentColor" />종료</button></>}</div>
      {finished && !active && <div className="finished-note"><strong>러닝이 저장됐습니다.</strong><span>{finished.date} · {fmtDistance(finished.distanceMeters)}</span></div>}
      {shown.track?.length > 1 && <div className="run-trace" aria-label="러닝 경로 미리보기"><svg viewBox="0 0 100 60" role="img"><path d={trackPath(shown.track)} /></svg><span>저장된 GPS 경로</span></div>}
      {shown.laps?.length > 0 && <LapDetails laps={shown.laps} mode={shown.mode} />}
    </section>}
    <section className="card run-stats"><div><span>오늘</span><strong>{todayCount}회 · {fmtDistance(todayMeters)}</strong></div><div><span>이번 주</span><strong>{weekRuns.length}회 · {fmtDistance(weekMeters)}</strong></div><div><span>주간 시간</span><strong>{fmtTime(weekElapsed)}</strong></div></section>
    <section className="running-history"><div className="section-heading compact"><div><span className="eyebrow">RUN LOG</span><h2>최근 러닝</h2></div></div>{recent.length ? recent.map((run) => <article className="card run-history-card" key={run.id}><div><strong>{run.date} · {run.mode === "treadmill" ? "러닝머신" : "야외"} · {(run.plan?.type || run.plan?.kind) === "interval" ? "인터벌" : "이지런"}</strong><span>{fmtDistance(run.distanceMeters)} · {fmtTime(run.elapsedMs)} · {fmtPace(run.elapsedMs, run.distanceMeters)}/km</span>{expandedRunId === run.id && <><LapDetails laps={run.laps} mode={run.mode} />{run.track?.length > 1 && <div className="run-trace"><svg viewBox="0 0 100 60" role="img" aria-label="저장된 GPS 경로"><path d={trackPath(run.track)} /></svg><span>저장된 GPS 경로</span></div>}</>}</div><div className="run-history-actions">{deleteId === run.id ? <div className="run-delete-confirm"><span>기록을 삭제할까요?</span><button onClick={() => deleteRun(run.id)}>삭제</button><button onClick={() => setDeleteId(null)}>취소</button></div> : <><button className="run-delete-button" onClick={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}>{expandedRunId === run.id ? "접기" : "랩"}</button><button className="run-delete-button" aria-label="러닝 기록 삭제" onClick={() => setDeleteId(run.id)}>삭제</button></>}</div></article>) : <p className="empty-copy running-empty">완료한 러닝이 여기에 기록됩니다.</p>}</section>
  </div>;
}
