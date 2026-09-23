import { useState } from "react";
import { SPLITS } from "../lib/program";
import PlanProposal from "./PlanProposal";

export default function ProgramScreen({ plan, intake, session, configured, revisions, onGenerate, onApply, onEditIntake }) {
  const [scope, setScope] = useState(session?.context && session.status !== "complete" ? "today" : "ongoing");
  const [request, setRequest] = useState("");
  const [proposal, setProposal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await onGenerate({ intake, currentPlan: plan, currentSession: session, request, scope });
      setProposal(scope === "today" ? { ...result, plan, alternatives: [] } : result);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  if (proposal) return <PlanProposal proposal={proposal} onCancel={() => setProposal(null)} applyingLabel={scope === "today" ? "오늘만 적용" : "변경 적용"} onApply={() => { onApply(proposal, scope); setProposal(null); setRequest(""); }} />;

  return (
    <div className="detail-content program-screen">
      <section className="card proposal-card">
        <span className="eyebrow">CURRENT PLAN · V{plan.version || 1}</span>
        <h2>{SPLITS[plan.split]?.label} · {SPLITS[plan.split]?.sessions.length}회 순환</h2>
        <p>{plan.goalSummary}</p>
        <div className="proposal-facts"><span>{plan.focus}</span>{plan.backVariety && <span>등 운동마다 종목 변경</span>}</div>
        <p className="proposal-rationale">{plan.rationale}</p>
      </section>
      <section className="card proposal-card">
        <span className="eyebrow">CHANGE WITH AI</span>
        <h2>수정 방향 적기</h2>
        <p>오늘만 바꿀지, 앞으로의 원칙을 바꿀지 선택하세요. 완료한 기록은 유지됩니다.</p>
        <div className="scope-options">
          {["today", "ongoing", "goal"].map((item) => <button key={item} disabled={item === "today" && (!session?.context || session.status === "complete")} className={scope === item ? "selected" : ""} onClick={() => setScope(item)}>{item === "today" ? "오늘만" : item === "ongoing" ? "앞으로 계속" : "목표 변경"}</button>)}
        </div>
        {!session?.context && <p className="connection-note">오늘만 종목을 바꾸려면 운동 준비에서 시간과 장소를 먼저 정해주세요.</p>}
        <textarea value={request} onChange={(event) => setRequest(event.target.value)} placeholder="예: 등 운동을 할 때마다 이전과 다른 종목으로 구성해줘" />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={!configured || request.trim().length < 4 || busy} onClick={generate}>{busy ? "제안 만드는 중…" : "AI 수정안 보기"}</button>
        {!configured && <p className="connection-note">서버에 OpenAI API 키를 설정하면 AI 수정안을 받을 수 있습니다.</p>}
      </section>
      <button className="secondary-button" onClick={onEditIntake}>초기 목표·일정 수정</button>
      {revisions.length > 0 && <section className="card proposal-card"><span className="eyebrow">CHANGE HISTORY</span><h2>최근 변경</h2><div className="revision-list">{revisions.slice(-4).reverse().map((item) => <div key={item.at}><strong>{item.scope === "today" ? "오늘만" : "계획 변경"}</strong><span>{item.summary}</span></div>)}</div></section>}
    </div>
  );
}
