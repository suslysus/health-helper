import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImagePlus, Pencil, Scale, Trash2, TrendingUp } from "lucide-react";
import { estimateMealNutrition, mergeMealNutrition } from "../lib/nutrition";
import { nutritionTargets, nutritionGoalDirection, validateNutritionSettings, recentWeightSummary } from "../lib/body";
import Modal from "./Modal";
import WeightSummary from "./WeightSummary";
import { normalizeMealPhotoAnalysis, prepareMealPhoto, scaleLabelNutrition } from "../lib/mealPhoto";
import { clearAiDerivedNutrition, missingMealNutrition, prepareMealEstimateReview } from "../lib/mealEstimate";

const EMPTY_NUTRITION = { calories: "", protein: "", carbs: "", fat: "" };
const nutritionFields = [["calories", "열량", "kcal"], ["protein", "단백질", "g"], ["carbs", "탄수화물", "g"], ["fat", "지방", "g"]];
const clockValue = (date) => Number.isNaN(date.getTime()) ? "12:00" : `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
const currentTime = () => clockValue(new Date());
const timeValue = (at) => clockValue(new Date(at));

export default function MealScreen({ date, meals = [], weights = [], nutritionSettings, goal, onSaveNutritionSettings, favoriteProducts = [], configured, onEstimateMeal, onAnalyzeMealPhoto, onSaveMeal, onUpdateMeal, onDeleteMeal, onSaveWeight, onDeleteWeight }) {
  const [name, setName] = useState("");
  const [time, setTime] = useState(currentTime);
  const [nutrition, setNutrition] = useState(EMPTY_NUTRITION);
  const [rememberProduct, setRememberProduct] = useState(false);
  const [editingMeal, setEditingMeal] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [estimateNote, setEstimateNote] = useState("");
  const [aiNutritionFields, setAiNutritionFields] = useState([]);
  const [pendingEstimate, setPendingEstimate] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [receiptItems, setReceiptItems] = useState([]);
  const [labelServings, setLabelServings] = useState("1");
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const todayWeight = weights.find((item) => item.date === date);
  const [weightInput, setWeightInput] = useState(todayWeight?.weight ? String(todayWeight.weight) : "");
  const [weightMessage, setWeightMessage] = useState("");
  const [nutritionSettingsOpen, setNutritionSettingsOpen] = useState(false);
  const [nutritionDraft, setNutritionDraft] = useState({ mode: "auto", calories: "", proteinGrams: "", fatGrams: "" });
  const [manualTargetBackup, setManualTargetBackup] = useState({ calories: "", proteinGrams: "", fatGrams: "" });
  const [nutritionSettingsError, setNutritionSettingsError] = useState("");
  const formRef = useRef(null);
  const dayMeals = useMemo(() => meals.filter((meal) => meal.date === date).sort((a, b) => String(a.at).localeCompare(String(b.at))), [date, meals]);
  const totals = dayMeals.reduce((sum, meal) => ({ calories: sum.calories + (Number(meal.calories) || 0), protein: sum.protein + (Number(meal.protein) || 0), carbs: sum.carbs + (Number(meal.carbs) || 0), fat: sum.fat + (Number(meal.fat) || 0) }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  const weightSummary = recentWeightSummary(weights, date);
  const targetWeight = weightSummary.currentWeekAverage ?? weightSummary.latest?.weight;
  const targetWeightBasis = weightSummary.currentWeekAverage != null ? "이번 주 평균" : "최근 체중";
  const goalBasis = ({ gain: "증량 기준", loss: "감량 기준", maintenance: "유지 기준" })[nutritionGoalDirection(goal)];
  const targets = nutritionTargets(targetWeight, nutritionSettings, goal);
  const isManualTarget = nutritionSettings?.mode === "manual";
  const manualOverrideNames = [
    ["calories", "열량"],
    ["proteinGrams", "단백질"],
    ["fatGrams", "지방"],
  ].filter(([key]) => nutritionSettings?.[key] != null).map(([, label]) => label);
  const targetNote = !targetWeight && (targets.protein == null || targets.fat == null)
    ? "체중 기록이 없어 빈 영양 목표를 계산할 수 없습니다. 체중을 기록해주세요."
    : targets.calories != null && targets.carbs == null
      ? "현재 목표에서 단백질·지방 열량이 총열량을 초과합니다. 목표를 조정해주세요."
      : targets.calories == null
        ? "체중 기록 필요 · 체중을 저장하면 자동 목표를 계산합니다."
        : isManualTarget && manualOverrideNames.length && manualOverrideNames.length < 3
          ? "직접 입력: " + manualOverrideNames.join("·") + " · 빈 항목은 자동 계산"
          : isManualTarget
            ? "직접 입력한 하루 목표"
            : targetWeightBasis + " " + targetWeight + "kg · " + goalBasis + " · 자동 추정치 (실제 소모 열량과 다를 수 있어요)";
  const missing = missingMealNutrition(nutrition);
  const receiptSelectionMissing = photo?.kind === "receipt" && !receiptItems.some((item) => item.selected && item.eatenAmount.trim());

  useEffect(() => {
    setWeightInput(todayWeight?.weight ? String(todayWeight.weight) : "");
    setWeightMessage("");
  }, [date, todayWeight?.weight]);

  const saveWeight = () => {
    const weight = Number(String(weightInput).replace(",", "."));
    if (!Number.isFinite(weight) || weight < 30 || weight > 300) { setWeightMessage("30~300kg 사이의 체중을 입력해주세요."); return; }
    onSaveWeight({ date, weight: Math.round(weight * 10) / 10, at: new Date().toISOString() });
    setWeightMessage("오늘 아침 체중을 저장했습니다.");
  };

  const openNutritionSettings = () => {
    const legacyValues = {
      calories: nutritionSettings?.calories == null ? "" : String(nutritionSettings.calories),
      proteinGrams: nutritionSettings?.proteinGrams == null ? "" : String(nutritionSettings.proteinGrams),
      fatGrams: nutritionSettings?.fatGrams == null ? "" : String(nutritionSettings.fatGrams),
    };
    const mode = nutritionSettings?.mode === "manual" ? "manual" : "auto";
    const savedManual = nutritionSettings?.manualBackup || legacyValues;
    setManualTargetBackup(savedManual);
    setNutritionDraft({ mode, ...(mode === "manual" ? legacyValues : savedManual) });
    setNutritionSettingsError("");
    setNutritionSettingsOpen(true);
  };

  const autoSettingsWithBackup = () => ({ mode: "auto", calories: manualTargetBackup.calories || undefined, proteinGrams: manualTargetBackup.proteinGrams || undefined, fatGrams: manualTargetBackup.fatGrams || undefined });

  const saveNutritionTargets = () => {
    if (nutritionDraft.mode !== "manual") {
      onSaveNutritionSettings(autoSettingsWithBackup());
      setNutritionSettingsOpen(false);
      return;
    }
    const hasManualValue = [nutritionDraft.calories, nutritionDraft.proteinGrams, nutritionDraft.fatGrams].some((value) => String(value).trim());
    if (!hasManualValue) {
      onSaveNutritionSettings(autoSettingsWithBackup());
      setNutritionSettingsOpen(false);
      return;
    }
    const normalized = validateNutritionSettings({ ...nutritionDraft, mode: "manual" }, targetWeight, goal);
    if (!normalized) {
      setNutritionSettingsError("입력한 목표를 확인해주세요. 체중 기준 자동값을 사용할 수 있고, 탄수화물 목표가 음수가 되면 열량이나 영양 목표를 조정해주세요.");
      return;
    }
    onSaveNutritionSettings({ ...normalized, mode: "manual" });
    setNutritionSettingsOpen(false);
  };

  const resetForm = () => {
    setName("");
    setTime(currentTime());
    setNutrition(EMPTY_NUTRITION);
    setRememberProduct(false);
    setEditingMeal(null);
    setError("");
    setEstimateNote("");
    setAiNutritionFields([]);
    setPendingEstimate(null);
    setPhoto(null);
    setReceiptItems([]);
    setLabelServings("1");
  };

  const analyzePhoto = async (file) => {
    if (!file) return;
    if (!configured) { setError("사진을 분석하려면 프로필에서 Gemini API 키를 연결해 주세요."); return; }
    setBusy(true);
    setError("");
    setEstimateNote("");
    try {
      const prepared = await prepareMealPhoto(file);
      const result = normalizeMealPhotoAnalysis(await onAnalyzeMealPhoto(prepared));
      if (result.kind === "unknown") throw new Error("사진에서 음식 정보를 찾지 못했습니다. 더 선명하게 찍거나 직접 입력해 주세요.");
      if (result.kind === "receipt" && !result.items.length) throw new Error("영수증의 음식 항목을 읽지 못했습니다. 더 선명하게 찍거나 직접 입력해 주세요.");
      if (result.kind === "nutrition_label" && Object.values(result.nutrition).every((value) => value === "")) throw new Error("영양성분표 숫자를 읽지 못했습니다. 더 선명하게 찍거나 직접 입력해 주세요.");
      setPhoto({ ...result, preview: prepared.preview });
      setPendingEstimate(null);
      setAiNutritionFields(result.kind === "food" ? nutritionFields.map(([key]) => key).filter((key) => result.nutrition[key] !== "") : []);
      setReceiptItems(result.items);
      setLabelServings("1");
      setName(result.kind === "receipt" ? "" : result.name);
      setNutrition(result.kind === "receipt" ? EMPTY_NUTRITION : result.nutrition);
      setEstimateNote([result.portionBasis, result.assumptions, result.explanation].filter(Boolean).join(" "));
      requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (photoError) { setError(photoError.message); }
    finally { setBusy(false); }
  };

  const updateReceiptItem = (index, patch) => {
    const next = receiptItems.map((item, position) => position === index ? { ...item, ...patch } : item);
    setReceiptItems(next);
    changeMealName(next.filter((item) => item.selected && item.eatenAmount.trim()).map((item) => `${item.name} ${item.eatenAmount.trim()}`).join(" + "));
  };

  const updateLabelServings = (value) => {
    setLabelServings(value);
    const scaled = scaleLabelNutrition(photo?.nutrition || EMPTY_NUTRITION, value);
    setNutrition(scaled || EMPTY_NUTRITION);
    setAiNutritionFields([]);
    setPendingEstimate(null);
    setEstimateNote(photo?.explanation || "");
  };

  const selectFavorite = (value) => {
    const product = favoriteProducts.find((item) => item.name === value);
    if (!product) return;
    setPhoto(null);
    setReceiptItems([]);
    setEstimateNote("");
    setAiNutritionFields([]);
    setPendingEstimate(null);
    setName(product.name);
    setNutrition(Object.fromEntries(nutritionFields.map(([key]) => [key, product.nutrition?.[key] == null ? "" : String(product.nutrition[key])])));
  };

  const beginEdit = (meal) => {
    setEditingMeal(meal);
    setName(meal.name || "");
    setTime(timeValue(meal.at));
    setNutrition(Object.fromEntries(nutritionFields.map(([key]) => [key, meal[key] == null ? "" : String(meal[key])])));
    setRememberProduct(false);
    setPendingDelete(null);
    setError("");
    setEstimateNote([meal.nutritionBasis, meal.nutritionAssumptions, meal.nutritionExplanation].filter(Boolean).join(" "));
    setAiNutritionFields(meal.estimatedFields || []);
    setPendingEstimate(null);
    setPhoto(null);
    setReceiptItems([]);
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const save = async () => {
    if (receiptSelectionMissing) { setError("영수증에서 먹은 항목과 양을 선택해 주세요."); return; }
    if (photo?.kind === "nutrition_label" && !scaleLabelNutrition(photo.nutrition, labelServings)) { setError("실제로 먹은 양을 입력해 주세요."); return; }
    if (!name.trim()) { setError("음식 이름을 입력해주세요."); return; }
    setBusy(true);
    setError("");
    setEstimateNote("");
    try {
      if (missing.length) {
        if (!configured) throw new Error("비어 있는 영양값을 추정하려면 프로필에서 AI 키를 먼저 연결해주세요.");
        const estimate = await onEstimateMeal({ name: name.trim(), providedNutrition: nutrition });
        const review = prepareMealEstimateReview(nutrition, estimate);
        setNutrition(Object.fromEntries(nutritionFields.map(([key]) => [key, String(review.nutrition[key])])));
        setAiNutritionFields((current) => [...new Set([...current, ...review.estimatedFields])]);
        setPendingEstimate(review);
        setEstimateNote([review.portionBasis, review.assumptions, review.explanation].filter(Boolean).join(" "));
        return;
      }
      const finalNutrition = mergeMealNutrition(nutrition, {});
      const localDateTime = new Date(`${date}T${time || "12:00"}:00`);
      const product = { name: name.trim(), nutrition: finalNutrition };
      const estimatedFields = aiNutritionFields;
      const record = {
        ...estimateMealNutrition({ product, serving: 1, at: localDateTime.toISOString() }),
        estimatedFields,
        aiEstimated: estimatedFields.length > 0 || photo?.kind === "receipt" || Boolean(editingMeal?.aiEstimated && !(editingMeal.estimatedFields || []).length),
        nutritionSource: photo?.kind === "nutrition_label" ? (estimatedFields.length ? "영양성분표 + AI 추정" : "영양성분표에서 읽음") : photo?.kind === "food" && estimatedFields.length ? "음식 사진 + AI 추정" : photo?.kind === "food" ? "사진 확인 후 직접 입력" : photo?.kind === "receipt" ? "영수증 항목 기반 AI 추정" : editingMeal?.nutritionSource || (estimatedFields.length ? "AI 추정" : ""),
        nutritionBasis: pendingEstimate?.portionBasis || photo?.portionBasis || photo?.basis || editingMeal?.nutritionBasis || "",
        nutritionAssumptions: pendingEstimate?.assumptions || photo?.assumptions || editingMeal?.nutritionAssumptions || "",
        nutritionExplanation: pendingEstimate?.explanation || photo?.explanation || editingMeal?.nutritionExplanation || "",
      };
      if (editingMeal) onUpdateMeal(editingMeal.id || editingMeal.at, record);
      else onSaveMeal(record, rememberProduct);
      resetForm();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const changeMealName = (value) => {
    setName(value);
    if (!pendingEstimate && !aiNutritionFields.length) return;
    setNutrition((current) => clearAiDerivedNutrition(current, aiNutritionFields));
    setAiNutritionFields([]);
    setPendingEstimate(null);
    setEstimateNote("음식 이름이 바뀌어 AI 추정값을 비웠습니다. 새 이름에 맞게 다시 추정하거나 직접 입력해 주세요.");
  };

  const changeNutrition = (key, value) => {
    setNutrition((current) => ({ ...current, [key]: value }));
    setAiNutritionFields((current) => current.filter((field) => field !== key));
    if (pendingEstimate?.estimatedFields.includes(key)) setPendingEstimate((current) => ({ ...current, estimatedFields: current.estimatedFields.filter((field) => field !== key) }));
  };

  const deleteMeal = (meal) => {
    const identity = meal.id || meal.at;
    onDeleteMeal(identity);
    if ((editingMeal?.id || editingMeal?.at) === identity) resetForm();
    setPendingDelete(null);
  };

  return (
    <div className="screen meal-screen">
      <section className="card weight-entry-card">
        <div className="section-heading compact"><div><span className="eyebrow">체중·식사</span><h1>아침 체중</h1></div><Scale size={22} /></div>
        <div className="weight-input-row"><label><input type="number" inputMode="decimal" min="30" max="300" step="0.1" value={weightInput} onChange={(event) => setWeightInput(event.target.value)} placeholder="예: 60.5" /><b>kg</b></label><button className="primary-button" onClick={saveWeight}>{todayWeight ? "수정" : "저장"}</button></div>
        <WeightSummary summary={weightSummary} />
        {todayWeight && <button className="text-button weight-delete" onClick={() => { onDeleteWeight(date); setWeightInput(""); setWeightMessage("오늘 체중 기록을 삭제했습니다."); }}>오늘 기록 삭제</button>}
        {weightMessage && <p className="input-feedback" role="status">{weightMessage}</p>}
      </section>

      <section className="card meal-total-card">
        <span className="eyebrow">오늘 식사</span>
        <div className="meal-total-heading"><div><h1>{dayMeals.length}번 기록</h1><p>{date}</p></div><strong>{Math.round(totals.calories)}<small> / {targets.calories ?? "—"} kcal</small></strong></div>
        <div className="meal-macro-summary"><span>단백질 <b>{Math.round(totals.protein)}/{targets.protein ?? "—"}g</b></span><span>탄수화물 <b>{Math.round(totals.carbs)}/{targets.carbs ?? "—"}g</b></span><span>지방 <b>{Math.round(totals.fat)}/{targets.fat ?? "—"}g</b></span></div>
        <p className={`macro-target-note${targets.calories != null && targets.carbs == null ? " nutrition-target-error" : ""}`}><TrendingUp size={14} />{targetNote}</p>
        <button className="nutrition-target-button" onClick={openNutritionSettings}>{isManualTarget ? "수동 목표 수정" : "자동 목표 · 설정"}</button>
      </section>

      <section className="card meal-timeline">
        <div className="section-heading compact"><div><span className="eyebrow">시간순 기록</span><h2>오늘 먹은 것</h2></div><span>{dayMeals.length}건</span></div>
        <div className="meal-entry-list">
          {dayMeals.length ? dayMeals.map((meal) => {
            const identity = meal.id || meal.at;
            return (
              <article className="timeline-entry meal meal-record" key={identity}>
                <label className="meal-time-editor">
                  <span>시간</span>
                  <input type="time" value={timeValue(meal.at)} onChange={(event) => { const changed = new Date(`${meal.date}T${event.target.value}:00`).toISOString(); onUpdateMeal(identity, { at: changed }); }} />
                </label>
                <div className="meal-record-content">
                  <strong>{meal.name}</strong>
                  <span>{meal.calories}kcal · 단백질 {meal.protein}g · 탄수화물 {meal.carbs || 0}g · 지방 {meal.fat || 0}g</span>
                  {(meal.nutritionSource || meal.aiEstimated) && <small>{meal.nutritionSource || "AI 추정 포함"}</small>}
                  {(meal.nutritionBasis || meal.nutritionAssumptions || meal.nutritionExplanation) && <details className="meal-estimate-basis"><summary>추정 기준</summary>{[meal.nutritionBasis, meal.nutritionAssumptions, meal.nutritionExplanation].filter(Boolean).map((text, index) => <p key={index}>{text}</p>)}</details>}
                  <div className="meal-record-actions">
                    <button disabled={busy} onClick={() => beginEdit(meal)}><Pencil size={13} />수정</button>
                    <button className="danger-text" onClick={() => setPendingDelete(pendingDelete === identity ? null : identity)}><Trash2 size={13} />삭제</button>
                  </div>
                  {pendingDelete === identity && <div className="inline-delete-confirm"><span>이 식사 기록을 삭제할까요?</span><button onClick={() => deleteMeal(meal)}>삭제 확정</button><button onClick={() => setPendingDelete(null)}>취소</button></div>}
                </div>
              </article>
            );
          }) : <p className="empty-copy">아직 기록한 식사가 없습니다.</p>}
        </div>
      </section>

      <section ref={formRef} className="card meal-add-card">
        <span className="eyebrow">{editingMeal ? "식사 수정" : "식사 추가"}</span>
        <h2>{editingMeal ? "기록을 고쳐서 저장하세요" : "이름만 적어도 됩니다"}</h2>
        <p>음식명에 먹은 양까지 적어주세요. 비워 둔 영양값은 AI가 일반적인 평균값으로 추정하고, 직접 적은 값은 그대로 저장합니다.</p>
        <fieldset className="meal-form" disabled={busy}>
          {!editingMeal && <div className="meal-photo-entry">
            <div className="meal-photo-buttons">
              <button type="button" className="secondary-button" disabled={busy} onClick={() => cameraInputRef.current?.click()}><Camera size={17} />사진 찍기</button>
              <button type="button" className="secondary-button" disabled={busy} onClick={() => galleryInputRef.current?.click()}><ImagePlus size={17} />앨범에서 선택</button>
            </div>
            <p className="meal-photo-note">사진은 Gemini로 전송해 분석하며 원본은 식사 기록에 저장하지 않습니다.</p>
            <input ref={cameraInputRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(event) => { void analyzePhoto(event.target.files?.[0]); event.target.value = ""; }} />
            <input ref={galleryInputRef} className="visually-hidden" type="file" accept="image/*" onChange={(event) => { void analyzePhoto(event.target.files?.[0]); event.target.value = ""; }} />
            {busy && <p className="input-feedback" role="status">사진을 읽는 중…</p>}
            {photo && <div className="meal-photo-review">
              <div className="meal-photo-review-heading"><img src={photo.preview} alt="선택한 식사 사진" /><div><strong>{photo.kind === "nutrition_label" ? "영양성분표" : photo.kind === "receipt" ? "영수증" : "음식 사진"}</strong><span>{photo.basis || "사진을 바탕으로 채운 내용"}</span></div><button type="button" className="text-button" onClick={resetForm}>입력 취소</button></div>
              {photo.kind === "nutrition_label" && <label className="meal-label-servings">실제로 먹은 양 <span>{photo.basis || "표기된 기준"}의 몇 배인가요?</span><input type="number" inputMode="decimal" min="0.1" max="20" step="0.1" value={labelServings} onChange={(event) => updateLabelServings(event.target.value)} /></label>}
              {photo.kind === "receipt" && <div className="meal-receipt-items"><strong>실제로 먹은 항목을 선택하세요</strong>{receiptItems.length ? receiptItems.map((item, index) => <div className="meal-receipt-item" key={`${item.name}-${index}`}><label><input type="checkbox" checked={item.selected} onChange={(event) => updateReceiptItem(index, { selected: event.target.checked })} /><span>{item.name}{item.purchasedAmount ? ` · 구매 ${item.purchasedAmount}` : ""}</span></label>{item.selected && <input value={item.eatenAmount} onChange={(event) => updateReceiptItem(index, { eatenAmount: event.target.value })} placeholder="먹은 양: 예 1개, 반 접시" aria-label={`${item.name} 먹은 양`} />}</div>) : <p>항목을 읽지 못했습니다. 다른 사진을 선택하거나 직접 입력해 주세요.</p>}</div>}
              {photo.kind === "food" && <p>사진만으로 분량과 조리법을 정확히 알 수 없습니다. 아래 이름과 영양값을 확인하고 고쳐 주세요.</p>}
            </div>}
          </div>}
          {favoriteProducts.length > 0 && !editingMeal && <label>자주 먹는 제품<select value="" onChange={(event) => selectFavorite(event.target.value)}><option value="">제품 선택</option>{favoriteProducts.map((item) => <option key={item.name}>{item.name}</option>)}</select></label>}
          <label>음식 이름<input value={name} onChange={(event) => changeMealName(event.target.value)} placeholder="예: 닭가슴살 2개와 양배추 200g" /></label>
          <div className="meal-top-fields"><label>먹은 시간<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label></div>
          <details key={photo?.kind || "manual"} open={Boolean(photo) || Boolean(pendingEstimate)} className="meal-optional-fields"><summary>{photo ? "사진에서 채운 영양값 확인·수정" : "영양값을 직접 입력할 때"}</summary><div className="meal-number-grid">{nutritionFields.map(([key, label, unit]) => <label key={key}>{label}<div><input type="number" inputMode="decimal" min="0" value={nutrition[key]} onChange={(event) => changeNutrition(key, event.target.value)} placeholder="AI" /><b>{unit}</b></div></label>)}</div></details>
          {!editingMeal && <label className="toggle-row"><span>자주 먹는 제품에 저장</span><input type="checkbox" checked={rememberProduct} onChange={(event) => setRememberProduct(event.target.checked)} /><i /></label>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {estimateNote && <p className="input-feedback" role="status">{pendingEstimate ? `AI 추정값 검토: ${estimateNote}` : estimateNote}</p>}
          {!photo && !editingMeal && <p className="meal-photo-note">음식 이름만 바꾸면 직접 입력하거나 즐겨찾기에서 불러온 영양값은 그대로 유지됩니다.</p>}
          <div className={editingMeal ? "meal-save-actions" : ""}>
            {editingMeal && <button className="secondary-button" onClick={resetForm}>수정 취소</button>}
            <button className="primary-button" disabled={!name.trim() || busy || receiptSelectionMissing || (photo?.kind === "nutrition_label" && !scaleLabelNutrition(photo.nutrition, labelServings))} onClick={save}>{busy ? "AI 처리 중…" : missing.length ? "AI로 빈 값 채우기" : pendingEstimate ? "추정값 확인 후 저장" : editingMeal ? "수정 내용 저장" : photo ? "확인한 내용 저장" : "입력한 값으로 저장"}</button>
          </div>
        </fieldset>
      </section>
      {nutritionSettingsOpen && <Modal title="하루 영양 목표 설정" onClose={() => setNutritionSettingsOpen(false)} className="nutrition-target-modal">
        <p className="sheet-description">체중 기록과 프로필 목표를 바탕으로 하루 목표를 계산합니다. 자동 목표는 참고용 추정치입니다.</p>
        <div className="nutrition-mode-choices" role="group" aria-label="목표 계산 방식">
          <button type="button" className={nutritionDraft.mode === "auto" ? "active" : ""} aria-pressed={nutritionDraft.mode === "auto"} onClick={() => setNutritionDraft((current) => ({ ...current, mode: "auto" }))}>자동</button>
          <button type="button" className={nutritionDraft.mode === "manual" ? "active" : ""} aria-pressed={nutritionDraft.mode === "manual"} onClick={() => setNutritionDraft((current) => ({ ...current, mode: "manual" }))}>수동</button>
        </div>
        {nutritionDraft.mode === "auto" ? <><p className="nutrition-target-hint">{targetWeight == null ? "체중을 기록하면 자동 목표를 계산합니다." : targetWeightBasis + " " + targetWeight + "kg · " + goalBasis}</p><p className="nutrition-target-hint">단백질은 체중×1.75g 기준, 10g 단위로 반올림합니다.</p></> : <>
        <div className="nutrition-target-fields">
          {[['calories', '총열량', 'kcal'], ['proteinGrams', '단백질', 'g'], ['fatGrams', '지방', 'g']].map(([key, label, unit]) => <label key={key}>{label}<div><input type="number" inputMode="numeric" min="0" step="1" value={nutritionDraft[key]} onChange={(event) => { const nextValue = event.target.value; setNutritionDraft((current) => ({ ...current, [key]: nextValue })); setManualTargetBackup((backup) => ({ ...backup, [key]: nextValue })); }} placeholder={key === 'calories' ? '빈칸이면 자동' : '빈칸이면 체중 기준'} /><span>{unit}</span></div></label>)}
        </div>
        <p className="nutrition-target-hint">각 항목은 선택 입력입니다. 비워두면 자동 계산하고, 모두 비우면 자동 모드로 전환합니다.</p>
        {(() => { const preview = nutritionTargets(targetWeight, nutritionDraft, goal); return <p className="nutrition-target-hint">미리보기 · {preview.calories ?? "—"} kcal · 단백질 {preview.protein ?? "—"}g · 탄수화물 {preview.carbs ?? "—"}g · 지방 {preview.fat ?? "—"}g</p>; })()}
        </>}
        {nutritionSettingsError && <p className="nutrition-target-error" role="alert">{nutritionSettingsError}</p>}
        <div className="nutrition-target-actions"><button className="secondary-button" disabled={!nutritionSettings || !isManualTarget} onClick={() => { onSaveNutritionSettings(autoSettingsWithBackup()); setNutritionSettingsOpen(false); }}>자동계산으로 전환</button><button className="primary-button" onClick={saveNutritionTargets}>저장</button></div>
      </Modal>}
    </div>
  );
}
