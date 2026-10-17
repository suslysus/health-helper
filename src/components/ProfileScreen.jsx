import { ChevronLeft, ChevronRight, Dumbbell, KeyRound, MapPin, Scale } from "lucide-react";
import { useEffect, useState } from "react";
import { cycleLabel, normalizeIntake, normalizePlan, EXERCISES } from "../lib/program";
import { normalizeTrainingRules } from "../lib/trainingRules";
import TrainingRuleSummary from "./TrainingRuleSummary";
import ProgramScreen from "./ProgramScreen";
import LocationManager from "./LocationManager";
import { recentWeightSummary, weeklyWeightAverages } from "../lib/body";
import WeightSummary from "./WeightSummary";

const groups = [
  { id: "training", title: "운동 목표와 추천 원칙", subtitle: "목표 · PPL 순환 · 종목 선택 우선순위", icon: Dumbbell, label: "운동 설정" },
  { id: "gym", title: "운동 장소와 기구", subtitle: "헬스장별로 실제 사용할 수 있는 기구", icon: MapPin, label: "환경" },
  { id: "body", title: "체중 변화", subtitle: "월~일 주간 평균과 지난주 대비 변화", icon: Scale, label: "신체" },
  { id: "settings", title: "AI 연결", subtitle: "Gemini API 키와 연결 상태", icon: KeyRound, label: "연결" },
];

export default function ProfileScreen({ intake, plan, session, weights = [], locations, onSaveLocation, onParseLocation, configured, apiKey, onSaveApiKey, section, onSectionChange, onGenerate, onInterpretRules, onApplyRevision, onSaveIntake, onBack }) {
  const current = groups.find((item) => item.id === section);

  if (section) return (
    <div className="screen profile-screen detail-page">
      <div className="flow-header"><button className="icon-button" onClick={() => onSectionChange(null)} aria-label="프로필 메뉴로 돌아가기"><ChevronLeft /></button><h1>{current?.title}</h1><span className="header-spacer" /></div>
      {section === "training" && <TrainingSettings intake={intake} plan={plan} session={session} configured={configured} onGenerate={onGenerate} onInterpretRules={onInterpretRules} onApplyRevision={onApplyRevision} onSaveIntake={onSaveIntake} />}
      {section === "gym" && <LocationManager locations={locations} configured={configured} onSave={onSaveLocation} onParse={onParseLocation} />}
      {section === "body" && <BodyWeightStats weights={weights} goal={intake.goal} />}
      {section === "settings" && <ApiKeySettings apiKey={apiKey} configured={configured} onSave={onSaveApiKey} />}
    </div>
  );

  return (
    <div className="screen profile-screen">
      <div className="flow-header profile-header"><button className="icon-button" onClick={onBack} aria-label="프로필 닫기"><ChevronLeft /></button><h1>프로필</h1><span className="header-spacer" /></div>
      <section className="profile-intro"><div className="avatar large">H</div><div><span className="eyebrow">MY TRAINING</span><h2>{cycleLabel(plan)}</h2><p>목표, 체중 변화, 장소와 AI 연결을 관리합니다.</p></div></section>
      <section className="settings-groups profile-menu-groups">{groups.map(({ id, title, subtitle, icon: Icon, label }) => <button className={`settings-row profile-menu-${id}`} key={id} onClick={() => onSectionChange(id)}><span className="settings-icon"><Icon size={20} /></span><div><small className="settings-category">{label}</small><strong>{title}</strong><small>{subtitle}</small></div><ChevronRight size={19} /></button>)}</section>
    </div>
  );
}

function BodyWeightStats({ weights, goal }) {
  const today = new Date();
  const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const summary = recentWeightSummary(weights, dateKey);
  const weeks = weeklyWeightAverages(weights, dateKey, 8);
  const values = weeks.map((item) => item.average).filter((value) => value != null);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const range = Math.max(0.5, max - min);
  const pace = summary.currentWeekAverage == null
    ? "이번 주 월~일 체중 기록이 없어 평균 변화는 표시하지 않습니다."
    : summary.previousWeekAverage == null
      ? "비교할 지난주 월~일 체중 기록이 없습니다. 기록한 날짜만 사용해 각 주의 평균을 계산합니다."
      : `이번 주와 지난주 월~일 평균의 차이입니다. 이번 주 ${summary.daysRecorded}일, 지난주 ${summary.previousDaysRecorded}일 기록으로 계산했습니다.`;
  return <div className="detail-content body-weight-stats">
    <section className="card body-summary-card"><span className="eyebrow">체중 변화</span><WeightSummary summary={summary} /><p className="weight-pace-note">{pace}</p></section>
    <section className="card weekly-weight-card"><div className="section-heading"><div><span className="eyebrow">주간 평균</span><h2>체중 변화</h2></div><span>최근 월~일 · 최대 8주</span></div>{weeks.length ? <div className="weekly-weight-chart">{weeks.map((week) => <div className="weekly-weight-column" key={week.startDate}><div className="weekly-weight-value">{week.average}kg</div><div className="weekly-weight-bar"><i style={{ height: `${30 + ((week.average - min) / range) * 70}%` }} /></div><div className="weekly-weight-dates"><small>{Number(week.startDate.slice(5, 7))}/{Number(week.startDate.slice(8, 10))}</small><small>– {Number(week.endDate.slice(5, 7))}/{Number(week.endDate.slice(8, 10))}</small></div><em>{week.daysRecorded}/7일</em></div>)}</div> : <p className="empty-copy">체중·식사 탭에서 아침 체중을 기록하면 월~일 주간 평균이 표시됩니다.</p>}</section>
    <section className="card weight-goal-card"><span className="eyebrow">프로필 목표</span><h2>{goal || "목표 미설정"}</h2><p>주간 변화는 월~일에 실제 기록한 날짜만 사용해 평균을 비교합니다. 목표에 따른 증량 속도 판정은 하지 않습니다.</p></section>
  </div>;
}

function TrainingSettings({ intake, plan, session, configured, onGenerate, onInterpretRules, onApplyRevision, onSaveIntake }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => normalizeIntake(intake));
  const [saved, setSaved] = useState("");
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setDraft(normalizeIntake(intake)), [intake]);
  const update = (key, value) => { setReview(null); setError(""); setDraft((current) => ({ ...current, [key]: value })); };
  const prepareReview = async () => {
    setBusy(true); setError("");
    try {
      const rules = configured ? await onInterpretRules(draft) : normalizeTrainingRules({ ...normalizePlan(null, draft), unresolved: ["AI 미연결: 문장 전체의 조건과 순서는 해석하지 못했습니다. 아래 기본 설정만 적용됩니다."] }, draft, EXERCISES);
      setReview(rules);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };

  return <div className="detail-content training-settings">
    <section className="card proposal-card training-goal-card">
      <span className="eyebrow">GOAL & PREFERENCE</span>
      <div className="section-heading"><div><h2>내 운동 기준</h2><p>문장을 운동 설정으로 정리하고 확인한 뒤 저장합니다. 시작 전 루틴부터 적용됩니다.</p></div>{!editing && <button className="text-button" onClick={() => { setSaved(""); setReview(null); setError(""); setEditing(true); }}>수정</button>}</div>
      {editing ? <div className="profile-goal-form">
        <label>가장 중요한 목표<textarea value={draft.goal} onChange={(event) => update("goal", event.target.value)} /></label>
        <label>운동 경험<select value={draft.experience} onChange={(event) => update("experience", event.target.value)}><option>처음 시작</option><option>초급</option><option>중급</option><option>숙련</option></select></label>
        <label>선호하는 방식<textarea value={draft.preferences} onChange={(event) => update("preferences", event.target.value)} placeholder="예: PPL 3회 후 1회 휴식, 등 운동은 매번 다르게" /></label>
        <label>피하고 싶은 운동이나 주의사항<textarea value={draft.avoid} onChange={(event) => update("avoid", event.target.value)} placeholder="없으면 비워두세요" /></label>
        <label className="machine-preference-toggle"><span><strong>같은 효과라면 머신 우선</strong><small>바벨·덤벨도 사용하되 같은 패턴의 머신이 있으면 먼저 추천합니다.</small></span><input type="checkbox" checked={draft.preferMachinesWhenEquivalent} onChange={(event) => update("preferMachinesWhenEquivalent", event.target.checked)} /></label>
        {review && <TrainingRuleSummary rules={review} editable onChange={setReview} />}
        {error && <p className="connection-note" role="alert">{error}</p>}
        <div className="profile-editor-actions"><button className="secondary-button" disabled={busy} onClick={() => { setDraft(normalizeIntake(intake)); setReview(null); setEditing(false); }}>취소</button>{review ? <button className="primary-button" onClick={() => { onSaveIntake(draft, review); setEditing(false); setSaved("확인한 설정을 저장했습니다. 아직 시작하지 않은 운동부터 적용됩니다."); }}>설정 확인하고 저장</button> : <button className="primary-button" disabled={busy || draft.goal.trim().length < 2} onClick={prepareReview}>{busy ? "운동 설정 정리 중…" : configured ? "AI로 설정 정리" : "기본 설정 확인"}</button>}</div>
      </div> : <div className="training-preference-summary"><div><span>목표</span><strong>{intake.goal}</strong></div><div><span>선호</span><strong>{intake.preferences || "별도 선호 없음"}</strong></div><div><span>주의사항</span><strong>{intake.avoid || "없음"}</strong></div><div><span>기구 우선순위</span><strong>{intake.preferMachinesWhenEquivalent !== false ? "동일 효과면 머신 우선" : "기구 종류보다 기존 순서 우선"}</strong></div></div>}
      {saved && <p className="connection-note" role="status">{saved}</p>}
      {!editing && <TrainingRuleSummary rules={plan.trainingRules} plan={plan} />}
    </section>
    {!editing && <ProgramScreen plan={plan} intake={intake} session={session} configured={configured} onGenerate={onGenerate} onApply={onApplyRevision} />}
  </div>;
}

function ApiKeySettings({ apiKey, configured, onSave }) {
  const [value, setValue] = useState(apiKey);
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async (key) => {
    setBusy(true);
    try { await onSave(key); setValue(key); setMessage(key.trim() ? "Gemini 키를 이 기기에 저장했습니다." : "Gemini 키를 삭제했습니다."); }
    catch { setMessage("키를 저장하지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  };
  return <div className="detail-content"><section className="card proposal-card">
    <h2>Google Gemini API 키</h2>
    <p>{configured ? "키가 이 기기에 저장되어 있습니다. 음식 추정과 요청한 운동 설정 해석에 사용합니다." : "Google AI Studio의 API 키를 연결할 수 있습니다. 키 없이도 운동 생성과 기록 기반 추천은 동작합니다."}</p>
    <label className="api-key-field">Gemini API 키<input type={visible ? "text" : "password"} autoComplete="off" spellCheck="false" value={value} onChange={(event) => setValue(event.target.value)} /></label>
    <label className="toggle-row"><span>키 표시</span><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /><i /></label>
    <button className="primary-button" disabled={busy} onClick={() => save(value)}>Gemini 키 저장</button>
    <button className="text-button" disabled={busy} onClick={() => save("")}>Gemini 키 삭제</button>
    <p className="connection-note">요청 제한은 같은 Google 프로젝트에서 공유됩니다. 한도 오류가 계속되면 <a href="https://aistudio.google.com/usage" target="_blank" rel="noreferrer">AI Studio 사용량</a>을 확인하세요. 새 키를 만들어도 같은 프로젝트의 한도는 유지됩니다.</p>
    <p className="connection-note">Android에서는 키를 암호화해 보관합니다. 운동·식사 기록은 현재 기기에 저장되며 다른 기기와 자동 동기화되지 않습니다.</p>
    {message && <p role="status" className="connection-note">{message}</p>}
  </section></div>;
}
