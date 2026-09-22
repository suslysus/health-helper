import { EXERCISES, SPLITS } from "../lib/program";

export default function PlanProposal({ proposal, onApply, onCancel, applyingLabel = "이 구성으로 시작" }) {
  const plan = proposal.plan;
  return (
    <div className="proposal-stack">
      <section className="card proposal-card">
        <span className="eyebrow">PROPOSED PLAN</span>
        <h2>{SPLITS[plan.split]?.label || "맞춤형"} · 주 {plan.daysPerWeek}회</h2>
        <p>{plan.goalSummary}</p>
        <div className="proposal-facts">
          <span>회당 {plan.durationMinutes}분</span>
          <span>{plan.focus}</span>
          {plan.backVariety && <span>등 운동마다 종목 변경</span>}
        </div>
        <p className="proposal-rationale">{plan.rationale}</p>
      </section>
      {proposal.alternatives?.length > 0 && <section className="card proposal-card"><span className="eyebrow">ALTERNATIVES</span><h2>다른 선택지</h2><div className="alternative-list">{proposal.alternatives.filter((item) => item.split !== plan.split).map((item) => <div key={item.split}><strong>{SPLITS[item.split]?.label}</strong><p>{item.reason}</p></div>)}</div></section>}
      {proposal.exerciseIds?.length > 0 && (
        <section className="card proposal-card">
          <span className="eyebrow">TODAY'S PREVIEW</span>
          <h2>첫 운동안</h2>
          <div className="preview-list">
            {proposal.exerciseIds.map((id, index) => {
              const item = EXERCISES.find((exercise) => exercise.id === id);
              return item && <div key={`${id}-${index}`}><span>{index + 1}</span><strong>{item.name}</strong><small>{item.target}</small></div>;
            })}
          </div>
        </section>
      )}
      <p className="proposal-explanation">{proposal.explanation}</p>
      <div className="proposal-actions">
        <button className="secondary-button" onClick={onCancel}>다시 수정</button>
        <button className="primary-button" onClick={onApply}>{applyingLabel}</button>
      </div>
    </div>
  );
}
