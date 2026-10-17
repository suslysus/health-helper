export const TRAINING_RULES_VERSION = 3;
export const TRAINING_PATTERNS = {
  horizontal_press: "수평 밀기", incline_press: "상부 가슴", vertical_press: "수직 밀기",
  chest_fly: "가슴 모으기", lateral_raise: "측면 어깨", rear_delt: "후면 어깨", elbow_extension: "삼두",
  vertical_pull: "수직 당기기", horizontal_pull: "수평 당기기", upper_back: "상부 등", lat_isolation: "광배 고립",
  elbow_flexion: "이두", brachioradialis: "이두·전완", wrist_extensors: "전완 신전", wrist_flexion: "전완 굴곡",
  squat: "스쿼트", knee_flexion: "햄스트링", hip_hinge: "힙힌지", glute_extension: "둔근 신전", single_leg: "한 다리 하체",
  hip_abduction: "아웃타이", calf_raise: "종아리", core_stability: "코어 버티기", core_flexion: "복부 굽히기",
  core_lower: "다리 들기", core_lateral: "옆구리",
};
const TYPES = ["full_body", "upper_lower", "ppl", "hybrid"];
const PPL_TYPES = ["PUSH", "PULL", "LEGS"];
const unique = (values) => [...new Set(Array.isArray(values) ? values.filter((value) => typeof value === "string") : [])];
const PATTERN_ALIASES = {
  horizontal_press: ["수평 밀기", "벤치 프레스"], incline_press: ["상부 가슴", "인클라인"], vertical_press: ["수직 밀기", "숄더 프레스", "오버헤드 프레스"],
  chest_fly: ["가슴 모으기", "케이블 플라이", "펙덱"], lateral_raise: ["측면 어깨", "사이드 레터럴", "측면 삼각근"], rear_delt: ["후면 어깨", "후면어깨", "후면 삼각근", "후면삼각근", "리어 델트", "리어델트"],
  elbow_extension: ["삼두", "팔꿈치 펴기"], vertical_pull: ["수직 당기기", "랫 풀다운", "풀업", "친업"], horizontal_pull: ["수평 당기기", "시티드 로우", "덤벨 로우", "바벨 로우"], upper_back: ["상부 등", "등 두께", "등 상부"], lat_isolation: ["광배 고립", "광배"],
  elbow_flexion: ["이두", "팔꿈치 굽히기"], brachioradialis: ["이두 전완", "해머 컬"], wrist_extensors: ["전완 신전"], wrist_flexion: ["전완 굴곡", "리스트 컬"],
  squat: ["스쿼트"], knee_flexion: ["햄스트링", "레그 컬"], hip_hinge: ["힙힌지", "루마니안 데드리프트", "rdl"], glute_extension: ["둔근 신전", "힙 쓰러스트", "글루트 드라이브"], single_leg: ["한 다리 하체", "런지", "스플릿 스쿼트"],
  hip_abduction: ["아웃타이", "힙 어브덕션"], calf_raise: ["종아리", "카프 레이즈"], core_stability: ["코어 버티기", "플랭크"], core_flexion: ["복부 굽히기", "크런치"],
  core_lower: ["다리 들기", "레그 레이즈", "니 레이즈"], core_lateral: ["옆구리", "사이드 플랭크", "힐 터치"],
};
const DESTINATIONS = [
  ["PUSH", /(?:PUSH|푸시|미는\s*날|밀기\s*날)/i],
  ["PULL", /(?:PULL|풀\s*데이|당기는\s*날|등날|등\s*날)/i],
  ["LEGS", /(?:LEGS|레그\s*데이|하체날|하체\s*날|다리\s*날)/i],
];
export function inferPatternSessions(intake = {}) {
  const text = [intake.preferences, intake.goal].filter(Boolean).join("\n");
  const result = {};
  const destinationPatterns = DESTINATIONS.map(([session, pattern]) => [session, new RegExp(pattern.source, `${pattern.flags}g`)]);
  for (const clause of text.split(/[\n,.!?。;]+/)) {
    for (const [pattern, aliases] of Object.entries(PATTERN_ALIASES)) {
      const escaped = aliases.map((alias) => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
      const mention = new RegExp(`(?:${escaped})`, "i");
      if (!mention.test(clause)) continue;
      const mentionIndex = clause.search(mention);
      const choices = [];
      for (const [session, destination] of destinationPatterns) {
        for (const match of clause.matchAll(destination)) {
          const index = match.index;
          if (Math.abs(index - mentionIndex) > 48) continue;
          const after = clause.slice(index + match[0].length);
          const before = clause.slice(Math.max(0, index - 18), index);
          if (/^\s*(?:말고|아니고|대신|가\s*아니라)/.test(after)) continue;
          choices.push({ session, distance: Math.abs(index - mentionIndex) });
        }
      }
      const uniqueChoices = [...new Set(choices.map((item) => item.session))];
      if (uniqueChoices.length === 1) result[pattern] = uniqueChoices[0];
    }
  }
  return result;
}
export function trainingSourceKey(intake = {}) {
  return JSON.stringify([intake.goal || "", intake.preferences || "", intake.avoid || "", intake.experience || "", intake.preferMachinesWhenEquivalent !== false]);
}
export function normalizeTrainingRules(raw = {}, intake = {}, exercises = []) {
  const known = new Set(exercises.map((item) => item.id));
  const ids = (values) => unique(values).filter((id) => !known.size || known.has(id));
  const excludedExerciseIds = ids(raw.excludedExerciseIds);
  const patterns = (values) => unique(values).filter((pattern) => Object.hasOwn(TRAINING_PATTERNS, pattern));
  const unknownIds = known.size ? unique([...unique(raw.preferredExerciseIds), ...unique(raw.excludedExerciseIds), ...unique(raw.fixedExerciseIds)]).filter((id) => !known.has(id)) : [];
  const priorities = patterns([...(raw.priorities || []), ...(!Object.hasOwn(raw, "varyExercises") && raw.pullForearms === true ? ["brachioradialis"] : [])]);
  const varyExercises = raw.varyExercises ?? raw.backVariety !== false;
  return {
    schemaVersion: TRAINING_RULES_VERSION, sourceKey: trainingSourceKey(intake),
    split: TYPES.includes(raw.split) ? raw.split : "hybrid",
    restAfterCycle: raw.restAfterCycle === true,
    preferMachinesWhenEquivalent: raw.preferMachinesWhenEquivalent ?? intake.preferMachinesWhenEquivalent !== false,
    varyExercises, backVariety: varyExercises,
    pullForearms: priorities.some((pattern) => ["brachioradialis", "wrist_extensors", "wrist_flexion"].includes(pattern))
      || exercises.some((exercise) => exercise.kind === "forearms" && [...ids(raw.preferredExerciseIds), ...ids(raw.fixedExerciseIds)].includes(exercise.id)),
    preferredExerciseIds: ids(raw.preferredExerciseIds).filter((id) => !excludedExerciseIds.includes(id)), excludedExerciseIds,
    fixedExerciseIds: ids(raw.fixedExerciseIds).filter((id) => !excludedExerciseIds.includes(id)),
    priorities,
    sessionOrders: Object.fromEntries(PPL_TYPES.map((type) => [type, patterns(raw.sessionOrders?.[type])])),
    patternSessions: { ...inferPatternSessions(intake), ...Object.fromEntries(Object.entries(raw.patternSessions || {}).filter(([pattern, session]) => Object.hasOwn(TRAINING_PATTERNS, pattern) && PPL_TYPES.includes(session))) },
    unresolved: unique([...unique(raw.unresolved), ...unknownIds.map((id) => `운동 목록에 없는 요청: ${id}`)]).map((text) => text.slice(0, 300)),
    interpretation: raw.interpretation === "ai" ? "ai" : "local",
  };
}
export function currentTrainingRules(intake, rules) {
  return [1, 2, TRAINING_RULES_VERSION].includes(rules?.schemaVersion) && rules.sourceKey === trainingSourceKey(intake) ? rules : null;
}
