import { useState } from "react";
import { INITIAL_INTAKE, localPlan, normalizeIntake } from "../lib/program";
import PlanProposal from "./PlanProposal";

export default function OnboardingScreen({ initialIntake, configured, apiKey, onSaveApiKey, onGenerate, onComplete, onCancel }) {
  const [intake, setIntake] = useState(() => normalizeIntake(initialIntake || INITIAL_INTAKE));
  const [proposal, setProposal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [keyValue, setKeyValue] = useState(apiKey || "");
  const [keyVisible, setKeyVisible] = useState(false);
  const [keyMessage, setKeyMessage] = useState("");

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

  const saveKey = async () => {
    setKeyMessage("");
    try {
      await onSaveApiKey(keyValue);
      setKeyMessage(keyValue.trim() ? "API 키를 이 기기에 저장했습니다." : "API 키를 삭제했습니다.");
    } catch (failure) {
      setKeyMessage(failure.message || "API 키를 저장하지 못했습니다.");
    }
  };

  return (
    <div className="screen onboarding-screen">
      <div className="onboarding-top"><img className="brand-mark" src="/healthlog-logo-v1.png" alt="HealthLog" /><span className="eyebrow">HEALTH HELPER · FIRST SETUP</span></div>
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
          <section className="card onboarding-form">
            <span className="eyebrow">GEMINI CONNECTION</span>
            <h2>{configured ? "Google Gemini 연결됨" : "먼저 Gemini를 연결해 주세요"}</h2>
            <p>Google AI Studio에서 발급한 무료 API 키를 입력하세요. 키는 휴대폰의 보안 저장소에만 저장됩니다.</p>
            <label>Gemini API 키<input type={keyVisible ? "text" : "password"} autoComplete="off" spellCheck="false" value={keyValue} placeholder="Google AI Studio API 키" onChange={(event) => setKeyValue(event.target.value)} /></label>
            <label className="toggle-row"><span>키 표시</span><input type="checkbox" checked={keyVisible} onChange={(event) => setKeyVisible(event.target.checked)} /><i /></label>
            <button className="secondary-button" disabled={!keyValue.trim()} onClick={saveKey}>{configured ? "키 다시 저장" : "Gemini 키 저장"}</button>
            {keyMessage && <p className="connection-note" role="status">{keyMessage}</p>}
          </section>
          <div className="card onboarding-form">
            <label>가장 중요한 목표<textarea value={intake.goal} onChange={(event) => update("goal", event.target.value)} placeholder="예: 근육을 늘리고 싶어요. 요일에 관계없이 4일 운동 순서를 반복하고, 등 운동은 매번 다른 종목으로 하고 싶어요." /></label>
            <label>운동 경험<select value={intake.experience} onChange={(event) => update("experience", event.target.value)}><option>처음 시작</option><option>초급</option><option>중급</option><option>숙련</option></select></label>
            <label>선호하는 방식<textarea value={intake.preferences} onChange={(event) => update("preferences", event.target.value)} placeholder="예: 등 운동을 할 때마다 다른 종목을 하고 싶어요." /></label>
            <label className="machine-preference-toggle"><span><strong>같은 효과라면 머신 우선</strong><small>바벨·덤벨도 사용하되 같은 패턴의 머신이 있으면 먼저 추천합니다.</small></span><input type="checkbox" checked={intake.preferMachinesWhenEquivalent} onChange={(event) => update("preferMachinesWhenEquivalent", event.target.checked)} /></label>
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
