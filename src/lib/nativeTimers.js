import { Capacitor, registerPlugin } from "@capacitor/core";

const RestTimer = registerPlugin("RestTimer");

export async function startRestTimerNotification(seconds) {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await RestTimer.start({ seconds: Math.max(1, Math.ceil(Number(seconds) || 1)) });
    return true;
  } catch {
    return false;
  }
}

export async function stopRestTimerNotification() {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await RestTimer.stop();
    return true;
  } catch {
    return false;
  }
}

export async function startExerciseTimerNotification(seconds, label = "운동 타이머") {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    await RestTimer.start({ seconds: Math.max(1, Math.ceil(Number(seconds) || 1)), kind: "exercise", label });
    return true;
  } catch {
    return false;
  }
}

export async function stopExerciseTimerNotification() {
  return stopRestTimerNotification();
}
