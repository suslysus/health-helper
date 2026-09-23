import { useState } from "react";
import { INITIAL_INTAKE, localPlan, normalizeIntake } from "../lib/program";
import PlanProposal from "./PlanProposal";

export default function OnboardingScreen({ initialIntake, configured, onGenerate, onComplete, onCancel }) {
  const [intake, setIntake] = useState(() => normalizeIntake(initialIntake || INITIAL_INTAKE));
  const [proposal, setProposal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});

  const update = (key, value) => setIntake((current) => ({ ...current, [key]: value }));
  const canContinue = intake.goal.trim().length >= 5;

  const generate = async () => {
    if (!canContinue) return;
    setError("");
    setBusy(true);
    try {
      const answeredIntake = questions.length ? { ...intake, clarifications: questions.map((question) => ({ question, answer: answers[question] || "" })) } : intake;
      const result = await onGenerate({ intake: answeredIntake, scope: "initial" });
      if (result.questions?.length && !questions.length) setQuestions(result.questions.slice(0, 2));
      else { setIntake(answeredIntake); setProposal(result); }
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const useLocal = () => {
    const plan = localPlan(intake);
    setProposal({
      plan,
      exerciseIds: [],
      alternatives: [
        { split: "ppl", reason: "밀기·당기기·하체를 3회 순서로 반복합니다." },
        { split: "upper_lower", reason: "상체·하체를 4회 순서로 반복합니다." },
        { split: "full_body", reason: "운동하는 날마다 전신을 다루는 3회 순환입니다." },
      ],
      explanation: "AI 연결 전 사용할 수 있는 기본안입니다. 나중에 운동 프로그램에서 AI 추천을 다시 받을 수 있습니다.",
      questions: [],
    });
  };

  return (
    <div className="screen onboarding-screen">
      <div className="onboarding-top"><span className="brand-mark">H</span><span className="eyebrow">HEALTH HELPER · FIRST SETUP</span></div>
      {onCancel && <button className="text-button" onClick={onCancel}>설정으로 돌아가기</button>}
      {proposal ? (
        <>
          <h1>운동 방식 제안</h1>
          <p>목표와 선호에 맞는 운동 순환을 먼저 정합니다. 운동 종목은 매번 바꿀 수 있습니다.</p>
          <PlanProposal proposal={proposal} onCancel={() => setProposal(null)} onApply={() => onComplete(intake, proposal)} />
        </>
      ) : (
        <>
          <h1>어떤 운동을 하고 싶나요?</h1>
          <p>목표와 선호하는 운동 주기를 자유롭게 적어주세요. 주 단위 횟수를 정하지 않아도 됩니다.</p>
          <div className="card onboarding-form">
            <label>가장 중요한 목표<textarea value={intake.goal} onChange={(event) => update("goal", event.target.value)} placeholder="예: 근육을 늘리고 싶어요. 요일에 관계없이 4일 운동 순서를 반복하고, 등 운동은 매번 다른 종목으로 하고 싶어요." /></label>
            <label>운동 경험<select value={intake.experience} onChange={(event) => update("experience", event.target.value)}><option>처음 시작</option><option>초급</option><option>중급</option><option>숙련</option></select></label>
            <label>선호하는 방식<textarea value={intake.preferences} onChange={(event) => update("preferences", event.target.value)} placeholder="예: 등 운동을 할 때마다 다른 종목을 하고 싶어요." /></label>
            <label>피하고 싶은 운동이나 주의사항<textarea value={intake.avoid} onChange={(event) => update("avoid", event.target.value)} placeholder="없으면 비워두세요" /></label>
          </div>
          {questions.length > 0 && <section className="card onboarding-form"><span className="eyebrow">AI FOLLOW-UP</span><h2>계획 전에 확인할게요</h2>{questions.map((question) => <label key={question}>{question}<input value={answers[question] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [question]: event.target.value }))} /></label>)}</section>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={!canContinue || busy || !configured || (questions.length > 0 && questions.some((question) => !answers[question]?.trim()))} onClick={generate}>{busy ? "계획을 만드는 중…" : questions.length ? "답변 반영해 제안 받기" : "AI로 운동 방식 제안 받기"}</button>
          {!configured && <p className="connection-note">AI 서버 키가 아직 연결되지 않았습니다. 아래 기본안으로 먼저 시작할 수 있습니다.</p>}
          <button className="text-button local-option" disabled={!canContinue} onClick={useLocal}>기본안으로 시작</button>
        </>
      )}
    </div>
  );
}
