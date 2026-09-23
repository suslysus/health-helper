import { Activity, ChevronLeft, ChevronRight, Dumbbell, KeyRound, MapPin } from "lucide-react";
import { useState } from "react";
import { SPLITS } from "../lib/program";
import ProgramScreen from "./ProgramScreen";
import LocationManager from "./LocationManager";

const groups = [
  { id: "program", title: "운동 프로그램", subtitle: "방식, 유연한 종목, AI 수정", icon: Dumbbell },
  { id: "body", title: "목표와 선호", subtitle: "처음 설정한 운동 목표", icon: Activity },
  { id: "gym", title: "운동 장소 관리", subtitle: "장소 추가와 기구 설정", icon: MapPin },
  { id: "settings", title: "AI 연결 상태", subtitle: "개인용 OpenAI API 서버", icon: KeyRound },
];

export default function ProfileScreen({ intake, plan, session, locations, onSaveLocation, onParseLocation, revisions, configured, initialSection, onGenerate, onApplyRevision, onEditIntake, onBack }) {
  const [section, setSection] = useState(initialSection);

  if (section) return (
    <div className="screen profile-screen detail-page">
      <div className="flow-header"><button className="icon-button" onClick={() => initialSection ? onBack() : setSection(null)} aria-label="뒤로"><ChevronLeft /></button><h1>{groups.find((item) => item.id === section)?.title}</h1><span className="header-spacer" /></div>
      {section === "program" && <ProgramScreen plan={plan} intake={intake} session={session} configured={configured} revisions={revisions} onGenerate={onGenerate} onApply={onApplyRevision} onEditIntake={onEditIntake} />}
      {section === "body" && <div className="detail-content"><section className="card proposal-card"><span className="eyebrow">YOUR GOAL</span><h2>{intake.goal}</h2><div className="summary-list"><div><span>운동 경험</span><strong>{intake.experience}</strong></div><div><span>선호</span><strong>{intake.preferences || "없음"}</strong></div><div><span>주의사항</span><strong>{intake.avoid || "없음"}</strong></div></div></section><button className="primary-button" onClick={onEditIntake}>목표·선호 수정</button></div>}
      {section === "gym" && <LocationManager locations={locations} configured={configured} onSave={onSaveLocation} onParse={onParseLocation} />}
      {section === "settings" && <div className="detail-content"><section className="card proposal-card"><h2>OpenAI API</h2><p>{configured ? "서버가 연결되어 있습니다. AI 추천을 요청할 때만 호출됩니다." : "서버에 API 키가 없어 AI 추천을 사용할 수 없습니다. 기본안과 직접 수정은 계속 사용할 수 있습니다."}</p><p>API 키는 앱에 입력하거나 저장하지 않습니다. 개인용 서버의 환경변수로 설정합니다.</p></section></div>}
    </div>
  );

  return (
    <div className="screen profile-screen">
      <div className="flow-header profile-header"><button className="icon-button" onClick={onBack} aria-label="뒤로"><ChevronLeft /></button><h1>목표와 설정</h1><span className="header-spacer" /></div>
      <section className="profile-intro"><div className="avatar large">H</div><div><h2>나의 운동 계획</h2><p>{SPLITS[plan.split]?.label} · {SPLITS[plan.split]?.sessions.length}회 순환 · 계획 v{plan.version || 1}</p></div></section>
      <section className="settings-groups">{groups.map(({ id, title, subtitle, icon: Icon }) => <button className="settings-row" key={id} onClick={() => setSection(id)}><span className="settings-icon"><Icon size={20} /></span><div><strong>{title}</strong><small>{subtitle}</small></div><ChevronRight size={19} /></button>)}</section>
    </div>
  );
}
