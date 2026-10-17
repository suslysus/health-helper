import { cycleLabel, EXERCISES, SPLITS } from "../lib/program";
import TrainingRuleSummary from "./TrainingRuleSummary";

export default function PlanProposal({ proposal, onApply, onCancel, applyingLabel = "이 구성으로 시작" }) {
  const plan = proposal.plan;
  return (
    <div className="proposal-stack">
      <section className="card proposal-card">
        <span className="eyebrow">PROPOSED PLAN</span>
        <h2>{cycleLabel(plan)}</h2>
        <p>{plan.goalSummary}</p>
        <div className="proposal-facts">
          <span>{plan.focus}</span>
          {plan.backVariety && <span>보조 종목 번갈아 추천</span>}
        </div>
        <p className="proposal-rationale">{plan.rationale}</p>
        {plan.trainingRules && <TrainingRuleSummary rules={plan.trainingRules} plan={plan} />}
      </section>
      {proposal.alternatives?.length > 0 && <section className="card proposal-card"><span className="eyebrow">ALTERNATIVES</span><h2>다른 선택지</h2><div className="alternative-list">{proposal.alternatives.filter((item) => item.split !== plan.split).map((item) => <div key={item.split}><strong>{SPLITS[item.split]?.label}</strong><p>{item.reason}</p></div>)}</div></section>}
      {proposal.exerciseIds?.length > 0 && (
        <section className="card proposal-card">
          <span className="eyebrow">TODAY'S PREVIEW</span>
          <h2>오늘 운동안</h2>
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
