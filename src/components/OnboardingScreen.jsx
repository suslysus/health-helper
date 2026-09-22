import { useState } from "react";
import { EQUIPMENT, INITIAL_INTAKE, localPlan, makeSession } from "../lib/program";
import PlanProposal from "./PlanProposal";

export default function OnboardingScreen({ initialIntake, configured, onGenerate, onComplete, onCancel }) {
  const [intake, setIntake] = useState(initialIntake || INITIAL_INTAKE);
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
    const session = makeSession(plan, intake);
    setProposal({
      plan,
      exerciseIds: session.exercises.map((exercise) => exercise.id),
      alternatives: [
        { split: "ppl", reason: "부위별로 묶기 편하지만 주당 운동 가능 일수와 회복 상황을 먼저 확인해야 합니다." },
        { split: "upper_lower", reason: "상체와 하체를 나누기 쉬우며 주 4일 일정에 잘 맞습니다." },
        { split: "full_body", reason: "적은 운동 일수에도 전신을 고르게 다룰 수 있습니다." },
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
          <p>목표와 일정에 맞는 원칙을 먼저 정합니다. 운동 종목은 매번 바꿀 수 있습니다.</p>
          <PlanProposal proposal={proposal} onCancel={() => setProposal(null)} onApply={() => onComplete(intake, proposal)} />
        </>
      ) : (
        <>
          <h1>어떤 운동을 하고 싶나요?</h1>
          <p>목표를 자유롭게 적어주세요. PPL 여부도 목표와 운동 가능 시간을 보고 함께 판단합니다.</p>
          <div className="card onboarding-form">
            <label>가장 중요한 목표<textarea value={intake.goal} onChange={(event) => update("goal", event.target.value)} placeholder="예: 근육을 늘리고 싶지만 주 3일만 운동 가능해요. 등 운동은 하는 날마다 다른 종목을 하고 싶어요." /></label>
            <div className="form-row">
              <label>주당 운동 일수<select value={intake.daysPerWeek} onChange={(event) => update("daysPerWeek", Number(event.target.value))}>{[1,2,3,4,5,6,7].map((day) => <option value={day} key={day}>{day}일</option>)}</select></label>
              <label>회당 시간<select value={intake.durationMinutes} onChange={(event) => update("durationMinutes", Number(event.target.value))}>{[30,45,60,75,90,120].map((minutes) => <option value={minutes} key={minutes}>{minutes}분</option>)}</select></label>
            </div>
            <label>운동 경험<select value={intake.experience} onChange={(event) => update("experience", event.target.value)}><option>처음 시작</option><option>초급</option><option>중급</option><option>숙련</option></select></label>
            <div className="onboarding-equipment"><span>사용 가능한 기구</span><div>{EQUIPMENT.map((item) => <button type="button" className={intake.equipment.includes(item) ? "selected" : ""} key={item} onClick={() => update("equipment", intake.equipment.includes(item) ? intake.equipment.filter((value) => value !== item) : [...intake.equipment, item])}>{item}</button>)}</div></div>
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
