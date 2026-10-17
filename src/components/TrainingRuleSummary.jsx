import { EXERCISES, SPLITS } from "../lib/program";
import { TRAINING_PATTERNS } from "../lib/trainingRules";

const names = (ids = []) => ids.map((id) => EXERCISES.find((item) => item.id === id)?.name || id).join(" · ");
export default function TrainingRuleSummary({ rules, plan, editable = false, onChange }) {
  const effective = rules || plan;
  const update = (key, value) => onChange?.({ ...rules, [key]: value });
  return <div className="training-rules-summary">
    <h3>{editable ? "저장할 운동 설정 확인" : "실제 추천에 적용되는 설정"}</h3>
    {!rules && <p className="connection-note">기본 규칙으로 해석한 설정입니다. 문장 전체를 반영하려면 수정에서 AI로 정리해 주세요.</p>}
    <dl className="summary-list">
      <div><dt>운동 방식</dt><dd>{editable ? <select value={rules.split} onChange={(e) => update("split", e.target.value)}>{Object.entries(SPLITS).map(([id, split]) => <option key={id} value={id}>{split.label}</option>)}</select> : SPLITS[effective.split]?.label}</dd></div>
      <div><dt>주기 끝 휴식</dt><dd>{editable ? <input type="checkbox" aria-label="주기 끝 하루 휴식" checked={rules.restAfterCycle} onChange={(e) => update("restAfterCycle", e.target.checked)} /> : effective.restAfterCycle ? "하루 휴식" : "별도 설정 없음"}</dd></div>
      <div><dt>동일 효과면 머신</dt><dd>{editable ? <input type="checkbox" aria-label="동일 효과면 머신 우선" checked={rules.preferMachinesWhenEquivalent} onChange={(e) => update("preferMachinesWhenEquivalent", e.target.checked)} /> : effective.preferMachinesWhenEquivalent ? "우선" : "별도 우선 없음"}</dd></div>
      <div><dt>보조 종목 순환</dt><dd>{editable ? <input type="checkbox" aria-label="보조 종목 번갈아 추천" checked={rules.varyExercises ?? rules.backVariety} onChange={(e) => onChange?.({ ...rules, varyExercises: e.target.checked, backVariety: e.target.checked })} /> : effective.backVariety ? "번갈아 추천" : "선호 종목 유지"}</dd></div>
      <div><dt>선호 종목</dt><dd>{names(effective.preferredExerciseIds) || "없음"}</dd></div>
      <div><dt>제외 종목</dt><dd>{names(effective.excludedExerciseIds) || "없음"}</dd></div>
      <div><dt>항상 포함</dt><dd>{names(effective.fixedExerciseIds) || "없음"}</dd></div>
      <div><dt>우선 부위·동작</dt><dd>{editable ? <div className="priority-options">{Object.entries(TRAINING_PATTERNS).map(([pattern, label]) => <button type="button" key={pattern} aria-pressed={rules.priorities.includes(pattern)} onClick={() => update("priorities", rules.priorities.includes(pattern) ? rules.priorities.filter((item) => item !== pattern) : [...rules.priorities, pattern])}>{label}</button>)}</div> : effective.priorities?.map((pattern) => TRAINING_PATTERNS[pattern]).join(" · ") || "기본 균형"}</dd></div>
      {Object.entries(effective.patternSessions || {}).map(([pattern, type]) => <div key={`day-${pattern}`}><dt>{TRAINING_PATTERNS[pattern]} 운동일</dt><dd>{editable ? <select aria-label={`${TRAINING_PATTERNS[pattern]} 운동일`} value={type} onChange={(event) => { const assigned = { ...rules.patternSessions }; if (event.target.value) assigned[pattern] = event.target.value; else delete assigned[pattern]; update("patternSessions", assigned); }}><option value="PUSH">PUSH · 밀기</option><option value="PULL">PULL · 당기기</option><option value="LEGS">LEGS · 하체</option></select> : type === "PULL" ? "PULL · 당기기" : type === "PUSH" ? "PUSH · 밀기" : "LEGS · 하체"}</dd></div>)}
      {Object.entries(rules?.sessionOrders || {}).filter(([, patterns]) => patterns.length).map(([type, patterns]) => <div key={type}><dt>{type} 순서</dt><dd>{patterns.map((pattern) => TRAINING_PATTERNS[pattern]).join(" → ")}</dd></div>)}
    </dl>
    {rules?.unresolved?.length > 0 && <div className="connection-note" role="status"><strong>자동으로 적용하지 못한 요청</strong><ul>{rules.unresolved.map((text, index) => <li key={index}>{text}</li>)}</ul></div>}
  </div>;
}
