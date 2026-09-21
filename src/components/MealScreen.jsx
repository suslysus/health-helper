import { ChevronDown, Plus, Search } from "lucide-react";
import { useState } from "react";
import { meals } from "../data";
import Modal from "./Modal";

const macros = [
  ["칼로리", "1,200 / 2,600kcal", 46],
  ["단백질", "92 / 130g", 71],
  ["탄수화물", "115 / 290g", 40],
  ["지방", "34 / 75g", 45],
];

export default function MealScreen() {
  const [addOpen, setAddOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <div className="screen meal-screen">
      <section className="card macro-card">
        <span className="eyebrow">TODAY</span>
        <h1>오늘 식사</h1>
        <div className="macro-list">
          {macros.map(([label, value, progress]) => (
            <div className="macro-row" key={label}>
              <div><span>{label}</span><strong>{value}</strong></div>
              <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
            </div>
          ))}
        </div>
      </section>

      <section className="meal-list">
        {meals.map((meal) => (
          <details className="card meal-card" key={meal.title}>
            <summary>
              <div><span>{meal.time}</span><strong>{meal.title}</strong></div>
              <div><b>{meal.calories}kcal</b><ChevronDown size={18} /></div>
            </summary>
            <div className="meal-items">
              {meal.items.map((item) => (
                <div className="food-row" key={item.name}>
                  <div><strong>{item.name}</strong><small>{item.amount} · {item.macro}</small></div>
                  <span>{item.calories}kcal</span>
                </div>
              ))}
              <button className="text-button" onClick={() => setManualOpen(true)}>식사 수정</button>
            </div>
          </details>
        ))}
        <div className="empty-meal-row"><span>저녁</span><p>아직 기록이 없습니다.</p></div>
      </section>

      <div className="sticky-action">
        <button className="primary-button" onClick={() => setAddOpen(true)}><Plus size={19} />식사 추가</button>
      </div>

      {addOpen && (
        <Modal title="식사 추가" onClose={() => setAddOpen(false)}>
          <div className="add-grid">
            <button onClick={() => { setAddOpen(false); setManualOpen(true); }}><Search /><span>이름 검색</span></button>
            <button onClick={() => { setAddOpen(false); setManualOpen(true); }}><Plus /><span>직접 입력</span></button>
          </div>
        </Modal>
      )}

      {manualOpen && (
        <Modal title="음식 직접 입력" onClose={() => setManualOpen(false)}>
          <form className="simple-form" onSubmit={(event) => { event.preventDefault(); setSaved(true); setManualOpen(false); window.setTimeout(() => setSaved(false), 1800); }}>
            <label>음식명<input required placeholder="예: 현미밥" /></label>
            <div className="form-row">
              <label>섭취량<input required type="number" placeholder="150" /></label>
              <label>단위<select><option>g</option><option>개</option><option>ml</option></select></label>
            </div>
            <label>칼로리<input required type="number" placeholder="250" /></label>
            <button className="primary-button" type="submit">기록 저장</button>
          </form>
        </Modal>
      )}

      {saved && <div className="toast">식사가 저장되었습니다.</div>}
    </div>
  );
}
