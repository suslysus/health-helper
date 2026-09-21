import { ChevronDown, Moon, Save, Sun } from "lucide-react";
import { useState } from "react";

const conditionGroups = [
  ["에너지", 3],
  ["근육통", 2],
  ["스트레스", 3],
];

export default function RecoveryScreen() {
  const [values, setValues] = useState(Object.fromEntries(conditionGroups));
  const [pain, setPain] = useState(false);
  const [sleepRating, setSleepRating] = useState(4);
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="screen recovery-screen">
      <section className="card sleep-card">
        <span className="eyebrow">SLEEP</span>
        <div className="section-heading compact"><h1>수면</h1><strong className="accent-text">7시간 20분</strong></div>
        <div className="sleep-range">
          <div><Moon size={18} /><span>취침</span><strong>23:50</strong></div>
          <i />
          <div><Sun size={18} /><span>기상</span><strong>07:10</strong></div>
        </div>
        <div className="sleep-rating"><span>만족도</span><div>{[1,2,3,4,5].map((item) => <button key={item} className={item === sleepRating ? "selected" : ""} onClick={() => setSleepRating(item)}>{item}</button>)}</div></div>
      </section>

      <section className="card condition-card">
        <span className="eyebrow">CONDITION</span>
        <h1>현재 컨디션</h1>
        {conditionGroups.map(([label]) => (
          <div className="condition-row" key={label}>
            <span>{label}</span>
            <div>
              {[1,2,3,4,5].map((value) => (
                <button key={value} className={values[label] === value ? "selected" : ""} onClick={() => setValues({ ...values, [label]: value })}>{value}</button>
              ))}
            </div>
          </div>
        ))}
        <label className="toggle-row"><span>통증 있음</span><input type="checkbox" checked={pain} onChange={(event) => setPain(event.target.checked)} /><i /></label>
        {pain && <textarea placeholder="불편한 부위와 느낌을 간단히 적어주세요" />}
      </section>

      <details className="card extra-details">
        <summary><span>추가 정보</span><ChevronDown size={18} /></summary>
        <div className="extra-row"><span>걸음 수</span><strong>8,230</strong></div>
        <div className="extra-row"><span>일정</span><strong>학교 · 알바</strong></div>
        <textarea placeholder="회복 메모" />
      </details>

      <div className="sticky-action">
        <button className="primary-button" onClick={save}><Save size={18} />회복 상태 저장</button>
      </div>
      {saved && <div className="toast">회복 상태가 저장되었습니다.</div>}
    </div>
  );
}
