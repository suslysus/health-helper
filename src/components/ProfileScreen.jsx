import { Activity, ChevronLeft, ChevronRight, Dumbbell, KeyRound, MapPin } from "lucide-react";
import { useState } from "react";

const groups = [
  { id: "body", title: "신체 정보", subtitle: "체중, 목표, 생활 패턴", icon: Activity },
  { id: "gym", title: "헬스장 및 기구", subtitle: "장소별 사용 가능 기구", icon: MapPin },
  { id: "program", title: "운동 프로그램", subtitle: "PUSH · PULL · LEGS", icon: Dumbbell },
  { id: "settings", title: "API 및 앱 설정", subtitle: "AI 연결, 알림", icon: KeyRound },
];

export default function ProfileScreen({ onBack }) {
  const [section, setSection] = useState(null);
  const [notice, setNotice] = useState("");
  const notify = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 1800);
  };

  if (section) {
    return (
      <div className="screen profile-screen detail-page">
        <div className="flow-header">
          <button className="icon-button" onClick={() => setSection(null)} aria-label="뒤로"><ChevronLeft /></button>
          <h1>{groups.find((item) => item.id === section)?.title}</h1>
          <span className="header-spacer" />
        </div>
        {section === "body" && <BodySettings onSave={() => notify("신체 정보가 저장되었습니다.")} />}
        {section === "gym" && <GymSettings onSave={() => notify("기구 목록이 저장되었습니다.")} />}
        {section === "program" && <ProgramSettings onSave={() => notify("프로그램이 저장되었습니다.")} />}
        {section === "settings" && <ApiSettings onNotice={notify} />}
        {notice && <div className="toast">{notice}</div>}
      </div>
    );
  }

  return (
    <div className="screen profile-screen">
      <div className="flow-header profile-header">
        <button className="icon-button" onClick={onBack} aria-label="뒤로"><ChevronLeft /></button>
        <h1>프로필 및 설정</h1>
        <span className="header-spacer" />
      </div>
      <section className="profile-intro">
        <div className="avatar large">김</div>
        <div><h2>김민준</h2><p>근비대 우선 · 운동 경력 6개월</p></div>
      </section>
      <section className="profile-stat-row">
        <div><span>신장</span><strong>175cm</strong></div>
        <div><span>체중</span><strong>70.3kg</strong></div>
        <div><span>목표</span><strong>75kg</strong></div>
      </section>
      <section className="settings-groups">
        {groups.map(({ id, title, subtitle, icon: Icon }) => (
          <button className="settings-row" key={id} onClick={() => setSection(id)}>
            <span className="settings-icon"><Icon size={20} /></span>
            <div><strong>{title}</strong><small>{subtitle}</small></div>
            <ChevronRight size={19} />
          </button>
        ))}
      </section>
    </div>
  );
}

function BodySettings({ onSave }) {
  return (
    <form className="detail-content" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
      <section className="card form-card"><h2>기본 정보</h2><div className="form-row"><label>신장<input defaultValue="175" /></label><label>현재 체중<input defaultValue="70.3" /></label></div><label>목표 체중<input defaultValue="75" /></label></section>
      <section className="card form-card"><h2>운동 목표</h2><select defaultValue="hypertrophy"><option value="hypertrophy">근비대 우선</option><option>근력 증가</option><option>체중 감량</option></select><label>통증 및 주의사항<textarea placeholder="필요할 때만 기록하세요" /></label></section>
      <button className="primary-button" type="submit">변경사항 저장</button>
    </form>
  );
}

function GymSettings({ onSave }) {
  const [available, setAvailable] = useState(["바벨", "덤벨", "벤치", "케이블"]);
  const equipment = ["바벨", "덤벨", "벤치", "케이블", "Hack Squat", "Smith Machine"];
  return (
    <div className="detail-content">
      <section className="card gym-card"><div className="section-heading compact"><div><span className="eyebrow">DEFAULT</span><h2>OO 헬스장</h2></div></div><p>사용할 수 있는 기구만 선택하세요.</p><div className="tag-list">{equipment.map((tag) => <button type="button" className={available.includes(tag) ? "selected" : ""} onClick={() => setAvailable((items) => items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag])} key={tag}>{tag}</button>)}</div></section>
      <button className="primary-button" onClick={onSave}>기구 목록 저장</button>
    </div>
  );
}

function ProgramSettings({ onSave }) {
  const [editing, setEditing] = useState("");
  return (
    <div className="detail-content">
      {[
        ["PUSH", "가슴 · 어깨 · 삼두", 6], ["PULL", "등 · 이두", 6], ["LEGS", "하체 · 종아리", 5]
      ].map(([name, muscles, count]) => <section className="card program-setting-card" key={name}><div><h2>{name}</h2><p>{muscles} · {count}개 운동</p>{editing === name && <small>세부 구성은 운동 시작 전 화면에서 조정합니다.</small>}</div><button className="text-button" onClick={() => setEditing(editing === name ? "" : name)}>{editing === name ? "닫기" : "보기"}</button></section>)}
      <button className="primary-button" onClick={onSave}>프로그램 저장</button>
    </div>
  );
}

function ApiSettings({ onNotice }) {
  const [apiKey, setApiKey] = useState("");
  return (
    <div className="detail-content">
      <section className="card form-card"><h2>AI 연결</h2><p>AI 조언을 요청할 때만 사용합니다.</p><label>LLM Provider<select><option>OpenAI</option><option>Gemini</option><option>Claude</option></select></label><label>API Key<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="••••••••••••" /></label><button className="secondary-button" onClick={() => onNotice(apiKey ? "입력값을 확인했습니다." : "API 키를 먼저 입력하세요.")}>입력 확인</button></section>
      <section className="card form-card"><h2>앱 설정</h2><label className="toggle-row"><span>휴식 타이머 알림</span><input type="checkbox" defaultChecked /><i /></label><label className="toggle-row"><span>체중 기록 알림</span><input type="checkbox" /><i /></label></section>
    </div>
  );
}
