import { completedWarmupCount, exerciseWarmupTarget, loadBasisForExercise, recommendedSetInput } from "./program.js";

export function nextIncompleteExerciseIndex(session) {
  return (session?.exercises || []).findIndex((item) => !item.skipped && (item.completedSets?.length || 0) < item.sets);
}

export function getRestPreview(session, history = []) {
  if (!session?.restTimer) return null;
  const nextIndex = nextIncompleteExerciseIndex(session);
  const timerExerciseIndex = session.restTimer.kind === "warmup"
    ? (session.exercises || []).findIndex((item) => item.id === session.restTimer.exerciseId && !item.skipped && (item.completedSets?.length || 0) < item.sets)
    : -1;
  const index = timerExerciseIndex >= 0 ? timerExerciseIndex : nextIndex;
  if (index < 0) return { complete: true };

  const exercise = session.exercises[index];
  const warmupTarget = exerciseWarmupTarget(exercise, session.exercises.slice(0, index));
  const warmups = completedWarmupCount(exercise, session.exercises.slice(0, index));
  const workSets = exercise.completedSets?.length || 0;
  const phase = warmups < warmupTarget ? "warmup" : "work";
  const needsChoice = !exercise.startConfirmed && warmups === 0 && workSets === 0;
  const suggested = recommendedSetInput(exercise, history, {
    phase,
    warmupIndex: warmups,
    context: session.context,
    currentSession: session,
    locationId: session.context?.locationId,
  });
  const recommendation = phase === "work" && exercise.nextRecommendedWeight != null
    ? {
      ...suggested,
      needsInitialLoad: false,
      weight: exercise.nextRecommendedWeight,
      reason: exercise.nextRecommendedReason || suggested.reason,
    }
    : suggested;
  const hasStartingEvidence = recommendation.source !== "target" || exercise.nextRecommendedWeight != null;

  return {
    exercise,
    index,
    phase,
    warmups,
    warmupTarget,
    workSets,
    needsChoice,
    recommendation,
    hasStartingEvidence,
    stage: needsChoice ? "choice" : phase,
  };
}

export function formatRestTargetDetails(preview, context = null) {
  if (!preview?.recommendation) return "목표를 계산할 수 없습니다.";
  const { exercise, phase, recommendation, hasStartingEvidence } = preview;
  const repetitions = phase === "warmup" ? recommendation.reps : exercise.reps || recommendation.reps;

  if (exercise.measurement === "reps_weight") {
    const loadBasis = loadBasisForExercise(exercise, context);
    let load;
    if (recommendation.needsInitialLoad) load = loadBasis === "assistance" ? "보조 중량은 기구에서 확인" : "중량 직접 설정";
    else if (Number(recommendation.weight) === 0 && loadBasis !== "assistance") load = "중량 직접 설정";
    else {
      const unit = loadBasis === "per_hand" ? "kg/손"
        : loadBasis === "per_side" ? "kg/편측"
          : loadBasis === "assistance" ? "kg(보조)"
            : loadBasis === "total_on_bar" || (loadBasis === "total" && exercise.equipment === "바벨") ? "kg(총중량)" : "kg";
      load = `${hasStartingEvidence ? "" : "기록 없음 · 시작 제안 "}${recommendation.weight ?? 0}${unit}`;
    }
    return `${load} · ${repetitions}회`;
  }

  if (["hold_seconds", "unilateral_hold_seconds", "timed_activity", "distance_time"].includes(exercise.measurement)) {
    const seconds = Number(recommendation.durationSeconds) || 30;
    const target = `${seconds}초${exercise.measurement === "unilateral_hold_seconds" ? "/편측" : ""}`;
    return exercise.measurement === "distance_time" ? `${target} · 거리 기록` : target;
  }
  return `${repetitions || 0}회${exercise.measurement === "unilateral" ? "/편측" : ""}`;
}
