const NUTRIENTS = ["calories", "protein", "carbs", "fat"];

function nutrientText(value) {
  const text = String(value ?? "").trim().replace(",", ".");
  return /^\d+(?:\.\d+)?$/.test(text) && Number(text) <= 10000 ? text : "";
}

export function normalizeMealPhotoAnalysis(raw) {
  const kind = ["nutrition_label", "receipt", "food"].includes(raw?.kind) ? raw.kind : "unknown";
  return {
    kind,
    name: String(raw?.name || "").trim().slice(0, 160),
    basis: String(raw?.basis || "").trim().slice(0, 160),
    portionBasis: String(raw?.portionBasis || "").trim().slice(0, 240),
    assumptions: String(raw?.assumptions || "").trim().slice(0, 300),
    explanation: String(raw?.explanation || "").trim().slice(0, 500),
    nutrition: Object.fromEntries(NUTRIENTS.map((key) => [key, nutrientText(raw?.nutrition?.[key])])),
    items: Array.isArray(raw?.items) ? raw.items.slice(0, 30).map((item) => ({
      name: String(item?.name || "").trim().slice(0, 120),
      purchasedAmount: String(item?.purchasedAmount || "").trim().slice(0, 60),
      eatenAmount: "",
      selected: false,
    })).filter((item) => item.name) : [],
  };
}

export function scaleLabelNutrition(nutrition, count) {
  const multiplier = Number(String(count).replace(",", "."));
  if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 20) return null;
  return Object.fromEntries(NUTRIENTS.map((key) => [key, nutrition[key] === "" ? "" : String(Math.round(Number(nutrition[key]) * multiplier * 10) / 10)]));
}

export async function prepareMealPhoto(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("사진 파일을 선택해 주세요.");
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error("사진을 열지 못했습니다. JPG 또는 PNG 사진을 선택해 주세요."); }
  try {
    const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    if (dataUrl.length > 12_000_000) throw new Error("사진이 너무 큽니다. 더 작은 사진을 선택해 주세요.");
    return { mimeType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1), preview: dataUrl };
  } finally { bitmap.close?.(); }
}
