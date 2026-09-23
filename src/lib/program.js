export const SPLITS = {
  full_body: { label: "전신", sessions: ["전신 A", "전신 B", "전신 C"] },
  upper_lower: { label: "상·하체", sessions: ["상체 A", "하체 A", "상체 B", "하체 B"] },
  ppl: { label: "PPL", sessions: ["PUSH", "PULL", "LEGS"] },
  hybrid: { label: "혼합형", sessions: ["전신", "상체", "하체", "선호 부위"] },
};

export const EXERCISES = [
  { id: "bench", name: "벤치 프레스", target: "가슴", kind: "push", equipment: "바벨", sets: 3, reps: "6~10" },
  { id: "db_press", name: "덤벨 프레스", target: "가슴", kind: "push", equipment: "덤벨", sets: 3, reps: "8~12" },
  { id: "pushup", name: "푸시업", target: "가슴", kind: "push", equipment: "맨몸", sets: 3, reps: "8~15" },
  { id: "shoulder_press", name: "숄더 프레스", target: "어깨", kind: "push", equipment: "덤벨", sets: 3, reps: "8~12" },
  { id: "lateral_raise", name: "사이드 레터럴 레이즈", target: "어깨", kind: "push", equipment: "덤벨", sets: 3, reps: "12~15" },
  { id: "triceps", name: "케이블 푸시다운", target: "삼두", kind: "push", equipment: "케이블", sets: 3, reps: "10~15" },
  { id: "lat_pulldown", name: "랫 풀다운", target: "등", kind: "back", equipment: "케이블", sets: 3, reps: "8~12" },
  { id: "cable_row", name: "시티드 케이블 로우", target: "등", kind: "back", equipment: "케이블", sets: 3, reps: "8~12" },
  { id: "db_row", name: "원암 덤벨 로우", target: "등", kind: "back", equipment: "덤벨", sets: 3, reps: "8~12" },
  { id: "barbell_row", name: "바벨 로우", target: "등", kind: "back", equipment: "바벨", sets: 3, reps: "6~10" },
  { id: "pullup", name: "풀업", target: "등", kind: "back", equipment: "철봉", sets: 3, reps: "5~10" },
  { id: "inverted_row", name: "인버티드 로우", target: "등", kind: "back", equipment: "철봉", sets: 3, reps: "8~12" },
  { id: "superman", name: "슈퍼맨", target: "등", kind: "back", equipment: "맨몸", sets: 3, reps: "10~15" },
  { id: "reverse_snow_angel", name: "리버스 스노우 엔젤", target: "등", kind: "back", equipment: "맨몸", sets: 3, reps: "10~15" },
  { id: "rear_delt", name: "리어 델트 플라이", target: "후면 어깨", kind: "pull", equipment: "덤벨", sets: 3, reps: "12~15" },
  { id: "curl", name: "덤벨 컬", target: "이두", kind: "pull", equipment: "덤벨", sets: 3, reps: "10~15" },
  { id: "squat", name: "스쿼트", target: "하체", kind: "legs", equipment: "바벨", sets: 3, reps: "6~10" },
  { id: "goblet_squat", name: "고블릿 스쿼트", target: "하체", kind: "legs", equipment: "덤벨", sets: 3, reps: "8~12" },
  { id: "lunge", name: "런지", target: "하체", kind: "legs", equipment: "맨몸", sets: 3, reps: "10~12" },
  { id: "rdl", name: "루마니안 데드리프트", target: "뒤 허벅지", kind: "legs", equipment: "덤벨", sets: 3, reps: "8~12" },
  { id: "calf_raise", name: "카프 레이즈", target: "종아리", kind: "legs", equipment: "맨몸", sets: 3, reps: "12~20" },
  { id: "plank", name: "플랭크", target: "코어", kind: "core", equipment: "맨몸", sets: 3, reps: "30~60초" },
];

export const EQUIPMENT = ["맨몸", "덤벨", "바벨", "케이블", "철봉"];
export const DEFAULT_LOCATIONS = [];

export const INITIAL_INTAKE = {
  goal: "",
  experience: "초급",
  avoid: "",
  preferences: "등 운동을 할 때마다 다른 종목을 하고 싶어요.",
};

export function normalizeIntake(raw = {}) {
  return {
    goal: String(raw.goal || ""),
    experience: String(raw.experience || INITIAL_INTAKE.experience),
    avoid: String(raw.avoid || ""),
    preferences: String(raw.preferences ?? INITIAL_INTAKE.preferences),
  };
}

export function localPlan(intake) {
  const split = "hybrid";
  return {
    split,
    goalSummary: intake.goal.trim(),
    focus: "전신 균형",
    rationale: "요일에 관계없이 4회 운동 순서를 반복하는 기본안입니다. 운동하는 날마다 시간과 장소를 고르고 종목을 바꿀 수 있습니다." + (intake.avoid ? " 입력한 주의사항은 기본안에서 자동 해석하지 않았으니 운동 전 종목을 확인해주세요." : ""),
    backVariety: true,
    excludedExerciseIds: [],
    changeSummary: "초기 운동 원칙",
  };
}

export function normalizePlan(raw, intake) {
  const base = localPlan(intake);
  const split = Object.hasOwn(SPLITS, raw?.split) ? raw.split : base.split;
  return {
    split,
    goalSummary: String(raw?.goalSummary || base.goalSummary).slice(0, 300),
    focus: String(raw?.focus || base.focus).slice(0, 100),
    rationale: String(raw?.rationale || base.rationale).slice(0, 600),
    backVariety: raw?.backVariety !== false,
    excludedExerciseIds: Array.isArray(raw?.excludedExerciseIds)
      ? raw.excludedExerciseIds.filter((id) => EXERCISES.some((item) => item.id === id))
      : [],
    changeSummary: String(raw?.changeSummary || base.changeSummary).slice(0, 250),
  };
}

export function workoutType(plan, sessionIndex, history = []) {
  const sessions = SPLITS[plan.split]?.sessions ?? SPLITS.full_body.sessions;
  const lastType = history.at(-1)?.label;
  const lastIndex = sessions.indexOf(lastType);
  if (lastIndex >= 0) return sessions[(lastIndex + 1) % sessions.length];
  return sessions[sessionIndex % sessions.length];
}

export function availableExercises(context, plan) {
  const listed = (context?.equipment || []).map((item) => String(item));
  const equipment = new Set(["맨몸", ...listed]);
  for (const standard of EQUIPMENT) {
    if (listed.some((item) => item.includes(standard))) equipment.add(standard);
  }
  const excluded = new Set(plan.excludedExerciseIds || []);
  return EXERCISES.filter((item) => equipment.has(item.equipment) && !excluded.has(item.id));
}

function pick(exercises, kind, count, shift = 0) {
  const choices = exercises.filter((exercise) => exercise.kind === kind);
  if (!choices.length) return [];
  return Array.from({ length: Math.min(count, choices.length) }, (_, index) => choices[(shift + index) % choices.length]);
}

export function makeSession(plan, history = [], date = new Date().toISOString().slice(0, 10), forcedType = null, context = null) {
  const sessionIndex = history.length;
  const type = SPLITS[plan.split]?.sessions.includes(forcedType) ? forcedType : workoutType(plan, sessionIndex, history);
  const pool = context?.durationMinutes && context?.locationId ? availableExercises(context, plan) : [];
  const priorBackSessions = history.filter((session) => session.exercises?.some((item) => item.kind === "back")).length;
  const backPool = pool.filter((item) => item.kind === "back");
  const backCount = backPool.length < 3 ? 1 : 2;
  const lastBackSession = [...history].reverse().find((item) => item.exercises?.some((exercise) => exercise.kind === "back"));
  const lastBackIds = lastBackSession?.exercises.filter((item) => item.kind === "back").map((item) => item.id).sort().join("|");
  let back = pick(pool, "back", backCount, plan.backVariety ? priorBackSessions % Math.max(backPool.length, 1) : 0);
  if (plan.backVariety && backPool.length > 1) {
    for (let shift = 1; shift < backPool.length && back.map((item) => item.id).sort().join("|") === lastBackIds; shift += 1) {
      back = pick(pool, "back", backCount, (priorBackSessions + shift) % backPool.length);
    }
  }
  let chosen;

  if (type === "PUSH") chosen = [...pick(pool, "push", 4, sessionIndex), ...pick(pool, "core", 1)];
  else if (type === "PULL") chosen = [...back, ...pick(pool, "pull", 1), ...pick(pool, "core", 1)];
  else if (type === "LEGS" || type.startsWith("하체")) chosen = [...pick(pool, "legs", 4, sessionIndex), ...pick(pool, "core", 1)];
  else if (type.startsWith("상체")) chosen = [...pick(pool, "push", 2, sessionIndex), ...back, ...pick(pool, "pull", 1)];
  else {
    chosen = [
      ...pick(pool, "legs", 1, sessionIndex),
      ...pick(pool, "push", 1, sessionIndex),
      ...back,
      ...pick(pool, "core", 1),
    ];
    if (context?.durationMinutes >= 75) {
      const extraLeg = pool.find((item) => item.id === "rdl" && !chosen.some((selected) => selected.id === item.id))
        || pick(pool, "legs", 2, sessionIndex).find((item) => !chosen.some((selected) => selected.id === item.id));
      if (extraLeg) chosen.push(extraLeg);
    }
    if (context?.durationMinutes >= 90) {
      const extraPush = pick(pool, "push", 2, sessionIndex).find((item) => !chosen.some((selected) => selected.id === item.id));
      if (extraPush) chosen.push(extraPush);
    }
  }

  const unique = [...new Map(chosen.map((exercise) => [exercise.id, exercise])).values()];
  return {
    id: `${date}-${sessionIndex}`,
    date,
    label: type,
    status: "draft",
    planVersion: plan.version || 1,
    context,
    exercises: unique.map((exercise) => ({ ...exercise, completedSets: [] })),
  };
}

export function replaceExercise(session, index, replacementId) {
  const replacement = EXERCISES.find((exercise) => exercise.id === replacementId);
  if (!replacement || index < 0 || index >= session.exercises.length) return session;
  if (session.exercises[index].completedSets?.length) return session;
  if (session.exercises.some((exercise, at) => at !== index && exercise.id === replacementId)) return session;
  return {
    ...session,
    exercises: session.exercises.map((exercise, at) => at === index ? { ...replacement, completedSets: [] } : exercise),
  };
}

export function applyExerciseIds(session, ids, plan) {
  if (!session.context?.durationMinutes || !session.context?.locationId) return session;
  const allowed = new Set(availableExercises(session.context, plan).map((item) => item.id));
  const recorded = session.exercises.filter((item) => item.completedSets?.length);
  const unique = [...new Set([...recorded.map((item) => item.id), ...ids])].filter((id) => allowed.has(id));
  if (unique.length < 2) return session;
  return {
    ...session,
    exercises: unique.map((id) => session.exercises.find((item) => item.id === id) || { ...EXERCISES.find((item) => item.id === id), completedSets: [] }),
  };
}
