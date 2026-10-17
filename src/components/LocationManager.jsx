import { useState } from "react";
import { EQUIPMENT_CATALOG, EXERCISES, availableExercises, normalizeLocationEquipment } from "../lib/program";

const equipmentChoices = EQUIPMENT_CATALOG.filter((item) => !["bodyweight", "machine"].includes(item.id));
const searchKey = (value) => value.toLowerCase().replaceAll(/\s+/g, "");

function matchesEquipmentId(value, id) {
  return normalizeLocationEquipment({ equipment: ["맨몸", value] }).equipmentItems.some((item) => item.id === id);
}

function mappedExercises(location) {
  return availableExercises(location, { excludedExerciseIds: [] }).map((exercise) => exercise.name);
}

export default function LocationManager({ locations, configured, onSave, onParse }) {
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [equipment, setEquipment] = useState([]);
  const [loadSteps, setLoadSteps] = useState({});
  const [availableLoads, setAvailableLoads] = useState({});
  const [loadBasis, setLoadBasis] = useState({});
  const [otherEquipment, setOtherEquipment] = useState("");
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const openForm = (location = null) => {
    setEditingId(location?.id || "new");
    setName(location?.name || "");
    setEquipment((location?.equipment || []).filter((item) => item !== "맨몸"));
    setLoadSteps(Object.fromEntries((location?.equipmentItems || []).map((item) => [item.id, (item.loadSteps || []).join(", ")])));
    setAvailableLoads(Object.fromEntries((location?.equipmentItems || []).map((item) => [item.id, (item.availableLoads || []).join(", ")])));
    setLoadBasis(Object.fromEntries((location?.equipmentItems || []).map((item) => [item.id, item.id === "assisted_pullup" ? "assistance" : item.id === "squat_machine" ? "total" : item.loadBasis || (item.id === "dumbbell" ? "per_hand" : "total")])));
    setDescription("");
    setEquipmentSearch("");
    setOtherEquipment("");
    setError("");
  };

  const addOther = () => {
    const item = otherEquipment.trim();
    if (item) setEquipment((current) => [...new Set([...current, item])]);
    setOtherEquipment("");
  };

  const selectedEquipmentIds = new Set(normalizeLocationEquipment({ equipment: ["맨몸", ...equipment] }).equipmentItems.map((item) => item.id));

  const toggleEquipment = (choice) => {
    const catalogItem = EQUIPMENT_CATALOG.find((item) => item.id === choice.id);
    const selected = selectedEquipmentIds.has(choice.id) || (!catalogItem && equipment.includes(choice.label));
    setEquipment((current) => selected
      ? current.filter((value) => !matchesEquipmentId(value, choice.id) && value !== choice.label)
      : [...new Set([...current, catalogItem?.label || choice.label])]);
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
    const originalItems = locations.find((location) => location.id === editingId)?.equipmentItems || [];
    const equipmentItems = normalizeLocationEquipment({ equipment: ["맨몸", ...equipment] }).equipmentItems.map((item) => ({ ...originalItems.find((original) => original.id === item.id), ...item,
      loadSteps: String(loadSteps[item.id] ?? item.loadSteps?.join(",") ?? "").split(",").map(Number).filter((step) => step > 0),
      availableLoads: String(availableLoads[item.id] || "").split(",").filter((value) => value.trim()).map(Number).filter((weight) => Number.isFinite(weight) && weight >= 0),
      loadBasis: item.id === "assisted_pullup" ? "assistance" : item.id === "squat_machine" ? "total" : loadBasis[item.id] || (item.id === "dumbbell" ? "per_hand" : "total"),
    }));
    onSave({ id: editingId === "new" ? null : editingId, name, equipment, equipmentItems });
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
        <details className="equipment-exercise-map"><summary>이 장소에서 가능한 운동 {mappedExercises(location).length}개</summary><p>{mappedExercises(location).join(" · ") || "맨몸 운동만 추천됩니다."}</p></details>
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
      <label>기구 검색<input value={equipmentSearch} onChange={(event) => setEquipmentSearch(event.target.value)} placeholder="기구 이름으로 검색" /></label>
      <div className="onboarding-equipment"><span>이 장소에 있는 기구 선택</span><p>모든 부위를 같은 목록에서 관리합니다. 맨몸 운동은 항상 포함됩니다.</p><div>{equipmentChoices.filter((item) => !equipmentSearch.trim() || [item.label, ...item.aliases].some((label) => searchKey(label).includes(searchKey(equipmentSearch.trim())))).map((item) => <button key={item.id} type="button" aria-pressed={selectedEquipmentIds.has(item.id)} className={selectedEquipmentIds.has(item.id) ? "selected" : ""} onClick={() => toggleEquipment(item)}>{item.label}</button>)}</div></div>

      <details className="equipment-exercise-map equipment-load-steps"><summary>기구별 중량 설정 (선택)</summary><p>실제 가능한 중량을 적으면 그 값으로만 추천합니다. 비워두면 증량 간격을 사용합니다. 바벨 간격은 한쪽에 추가할 원판 무게이며, 기록 중량은 봉 포함 총중량입니다. 스쿼트 머신은 양쪽에 추가한 원판의 합계로 기록하며 기구 무게는 제외합니다.</p>{normalizeLocationEquipment({ equipment: ["맨몸", ...equipment] }).equipmentItems.filter((item) => item.id !== "bodyweight" && item.exerciseIds?.some((id) => EXERCISES.find((exercise) => exercise.id === id)?.equipment !== "맨몸")).map((item) => <div key={item.id}><strong>{item.label}</strong><label>중량 기록 기준<select disabled={item.id === "assisted_pullup" || item.id === "squat_machine"} value={item.id === "assisted_pullup" ? "assistance" : item.id === "squat_machine" ? "total" : loadBasis[item.id] || (item.id === "dumbbell" ? "per_hand" : "total")} onChange={(e) => setLoadBasis((current) => ({ ...current, [item.id]: e.target.value }))}>{item.id === "assisted_pullup" && <option value="assistance">보조 중량 · 낮을수록 어려움</option>}{item.id === "squat_machine" ? <option value="total">양쪽 추가 원판 합계 · 기구 무게 제외</option> : <><option value="total">전체 중량</option><option value="per_hand">한 손 중량</option><option value="per_side">한쪽 원판 중량</option></>}</select></label><label>사용 가능한 중량 (kg)<input value={availableLoads[item.id] || ""} onChange={(e) => setAvailableLoads((current) => ({ ...current, [item.id]: e.target.value }))} placeholder="예: 7.5, 15, 22.5" /></label><label>증량 간격 (kg)<input value={loadSteps[item.id] ?? item.loadSteps?.join(", ") ?? ""} onChange={(e) => setLoadSteps((current) => ({ ...current, [item.id]: e.target.value }))} placeholder={item.id === "squat_machine" ? "양쪽 추가 원판 합계 (예: 5, 10)" : "예: 2.5"} /></label></div>)}</details>
      <div className="add-exercise-row"><input aria-label="기타 기구 이름" value={otherEquipment} onChange={(event) => setOtherEquipment(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addOther(); }} placeholder="다른 기구 직접 입력" /><button className="secondary-button" disabled={!otherEquipment.trim()} onClick={addOther}>추가</button></div>
      {equipment.filter((value) => !equipmentChoices.some((item) => matchesEquipmentId(value, item.id))).length > 0 && <div className="custom-equipment-list">{equipment.filter((value) => !equipmentChoices.some((item) => matchesEquipmentId(value, item.id))).map((item) => <button key={item} onClick={() => setEquipment((current) => current.filter((value) => value !== item))}>{item} ×</button>)}</div>}
      <details className="equipment-exercise-map" open><summary>현재 기구로 가능한 운동 {mappedExercises({ equipment: ["맨몸", ...equipment] }).length}개</summary><p>{mappedExercises({ equipment: ["맨몸", ...equipment] }).join(" · ") || "맨몸 운동만 추천됩니다."}</p></details>
      <p>선택한 기구와 필수 보조 기구가 모두 있는 운동만 추천합니다. 예: 덤벨 프레스는 덤벨과 벤치가 모두 필요합니다.</p>
    </section>
    <section className="card proposal-card location-form">
      <span className="eyebrow">OPTIONAL · AI</span>
      <h2>문장으로 적기</h2>
      <p>장소와 기구를 문장으로 적으면 입력칸에 정리합니다. 확인 후 저장하세요.</p>
      <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="예: 집에서 운동해요. 조절식 덤벨과 철봉이 있어요." />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="secondary-button" disabled={!configured || description.trim().length < 6 || busy} onClick={parseDescription}>{busy ? "정리 중…" : "AI로 이름·기구 정리"}</button>
      {!configured && <p className="connection-note">Gemini API 키를 연결하면 문장 정리를 사용할 수 있습니다.</p>}
    </section>
    <button className="primary-button" disabled={!name.trim()} onClick={save}>장소 저장</button>
  </div>;
}
