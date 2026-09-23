import { useState } from "react";
import { EQUIPMENT } from "../lib/program";

const optionalEquipment = EQUIPMENT.filter((item) => item !== "맨몸");

export default function LocationManager({ locations, configured, onSave, onParse }) {
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [equipment, setEquipment] = useState([]);
  const [otherEquipment, setOtherEquipment] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const openForm = (location = null) => {
    setEditingId(location?.id || "new");
    setName(location?.name || "");
    setEquipment((location?.equipment || []).filter((item) => item !== "맨몸"));
    setDescription("");
    setOtherEquipment("");
    setError("");
  };

  const addOther = () => {
    const item = otherEquipment.trim();
    if (item) setEquipment((current) => [...new Set([...current, item])]);
    setOtherEquipment("");
  };

  const parseDescription = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await onParse(description);
      setName(result.name || "");
      setEquipment([...new Set((result.equipment || []).filter((item) => item !== "맨몸"))]);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!name.trim()) return;
    onSave({ id: editingId === "new" ? null : editingId, name, equipment });
    setEditingId(null);
  };

  if (!editingId) return <div className="detail-content">
    <section className="card proposal-card">
      <span className="eyebrow">WORKOUT LOCATIONS</span>
      <h2>운동 장소 관리</h2>
      <p>여기에서 저장한 장소만 운동 준비에서 선택할 수 있습니다.</p>
      {locations.length ? locations.map((location) => <div className="location-summary" key={location.id}>
        <div className="location-summary-heading"><strong>{location.name}</strong><button className="text-button" onClick={() => openForm(location)}>{location.ready ? "수정" : "설정 완료하기"}</button></div>
        <p>{location.equipment.filter((item) => item !== "맨몸").join(" · ") || "기구 없음 · 맨몸 운동"}</p>
        {!location.ready && <small>기존 장소입니다. 이름과 기구를 확인하고 저장하면 선택할 수 있습니다.</small>}
      </div>) : <p className="empty-locations">등록된 장소가 없습니다.</p>}
    </section>
    <button className="primary-button" onClick={() => openForm()}>추가하기</button>
  </div>;

  return <div className="detail-content">
    <button className="text-button location-back" onClick={() => setEditingId(null)}>← 운동 장소 목록</button>
    <section className="card proposal-card location-form">
      <span className="eyebrow">{editingId === "new" ? "ADD LOCATION" : "EDIT LOCATION"}</span>
      <h2>{editingId === "new" ? "장소 추가" : "장소 수정"}</h2>
      <label>장소 이름<input value={name} onChange={(event) => setName(event.target.value)} placeholder="예: 집, 운동장, 공원" /></label>
      <div className="onboarding-equipment"><span>이 장소에 있는 기구</span><div>{optionalEquipment.map((item) => <button key={item} type="button" aria-pressed={equipment.includes(item)} className={equipment.includes(item) ? "selected" : ""} onClick={() => setEquipment((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])}>{item}</button>)}</div></div>
      <div className="add-exercise-row"><input aria-label="기타 기구 이름" value={otherEquipment} onChange={(event) => setOtherEquipment(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addOther(); }} placeholder="다른 기구 직접 입력" /><button className="secondary-button" disabled={!otherEquipment.trim()} onClick={addOther}>추가</button></div>
      {equipment.filter((item) => !optionalEquipment.includes(item)).length > 0 && <div className="custom-equipment-list">{equipment.filter((item) => !optionalEquipment.includes(item)).map((item) => <button key={item} onClick={() => setEquipment((current) => current.filter((value) => value !== item))}>{item} ×</button>)}</div>}
      <p>기구를 선택하지 않으면 맨몸 운동으로 구성합니다.</p>
    </section>
    <section className="card proposal-card location-form">
      <span className="eyebrow">OPTIONAL · AI</span>
      <h2>문장으로 적기</h2>
      <p>장소와 기구를 문장으로 적으면 입력칸에 정리합니다. 확인 후 저장하세요.</p>
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="예: 집에서 운동해요. 조절식 덤벨과 철봉이 있어요." />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="secondary-button" disabled={!configured || description.trim().length < 6 || busy} onClick={parseDescription}>{busy ? "정리 중…" : "AI로 이름·기구 정리"}</button>
      {!configured && <p className="connection-note">OpenAI API 키를 연결하면 문장 정리를 사용할 수 있습니다.</p>}
    </section>
    <button className="primary-button" disabled={!name.trim()} onClick={save}>장소 저장</button>
  </div>;
}
