import { Capacitor, registerPlugin } from "@capacitor/core";
import { advanceRun, createRunSession, finishRun, ingestRunPosition, lapRun, pauseRun, resumeRun } from "./running.js";

const RunningTracker = registerPlugin("RunningTracker");

function unwrap(result) {
  if (result && Object.hasOwn(result, "session")) return result.session ?? null;
  return result?.session ?? result ?? null;
}

export function createRunningTracker({ onState, onError, initialSession } = {}) {
  const native = Capacitor.isNativePlatform();
  const restoredAt = Date.now();
  let session = !native && initialSession?.status && initialSession.status !== "completed"
    ? { ...initialSession, status: "paused", pausedAt: restoredAt, clockAnchorMs: restoredAt, lastFix: null, lastFixPoint: null, distanceAnchor: null, distanceCandidate: null, needsAnchorReset: true, gpsStatus: initialSession.mode === "outdoor" ? "waiting" : "unavailable" }
    : null;
  let watchId = null;
  let pendingStart = null;
  let pendingResume = null;
  let listenerHandle = null;
  let nativeReady = null;
  let clockTimer = null;
  let visibilityHandler = null;
  const subscribers = new Set();
  let destroyed = false;

  const result = () => {
    if (!native && session?.status === "running") session = advanceRun(session, Date.now());
    return { session };
  };
  const publish = (value) => {
    if (destroyed) return result();
    if (value !== undefined) session = value;
    const state = result();
    syncNativeClock(session);
    onState?.(state);
    subscribers.forEach((listener) => listener(state));
    return state;
  };
  const asError = (error) => error instanceof Error ? error : new Error(String(error?.message || error || "러닝 기능을 사용할 수 없습니다."));
  const fail = (error) => {
    const normalized = asError(error);
    onError?.(normalized);
    return normalized;
  };
  const stopBrowserWatch = () => {
    if (watchId != null && globalThis.navigator?.geolocation) navigator.geolocation.clearWatch(watchId);
    watchId = null;
  };
  const stopBrowserClock = () => {
    if (clockTimer != null) globalThis.clearInterval(clockTimer);
    clockTimer = null;
  };
  const syncNativeClock = (nativeSession) => {
    if (!native) return;
    const shouldPoll = nativeSession?.mode === "treadmill" && nativeSession.status === "running";
    if (shouldPoll && clockTimer == null) {
      clockTimer = globalThis.setInterval(async () => {
        if (destroyed) return;
        try { session = unwrap(await RunningTracker.getState()); publish(session); }
        catch (error) { fail(error); }
      }, 1_000);
    } else if (!shouldPoll && clockTimer != null) stopBrowserClock();
  };
  const startBrowserClock = () => {
    if (native || clockTimer != null) return;
    clockTimer = globalThis.setInterval(() => {
      if (session?.status === "running") publish(advanceRun(session, Date.now()));
      else stopBrowserClock();
    }, 1_000);
  };

  async function initializeNative() {
    if (!native || destroyed) return;
    if (nativeReady) return nativeReady;
    nativeReady = RunningTracker.addListener("runningState", (payload) => publish(unwrap(payload)))
      .then((handle) => {
        if (destroyed) void handle.remove();
        else listenerHandle = handle;
      })
      .catch((error) => { fail(error); throw error; });
    return nativeReady;
  }
  void initializeNative();

  if (!native && globalThis.document?.addEventListener) {
    visibilityHandler = () => {
      if (session?.mode === "outdoor" && session.status === "running") {
        session = { ...session, lastFix: null, lastFixPoint: null, distanceAnchor: null, distanceCandidate: null, needsAnchorReset: true, gpsStatus: "waiting" };
        publish(session);
      }
    };
    document.addEventListener("visibilitychange", visibilityHandler);
  }

  async function nativeCommand(method, options) {
    try {
      const response = await RunningTracker[method](options || {});
      return publish(unwrap(response));
    } catch (error) {
      fail(error);
      throw error;
    }
  }

  function startBrowser(options) {
    if (session) throw new Error("현재 러닝 기록을 저장하는 중입니다. 잠시 후 다시 시작해 주세요.");
    const startedAt = Date.now();
    if (options?.mode === "treadmill") {
      session = { ...createRunSession(options, startedAt), gpsStatus: "unavailable" };
      startBrowserClock();
      return Promise.resolve(publish(session));
    }
    if (!globalThis.navigator?.geolocation) {
      const error = new Error("이 브라우저에서는 GPS 위치 기능을 사용할 수 없습니다.");
      fail(error);
      return Promise.reject(error);
    }
    return new Promise((resolve, reject) => {
      pendingStart = { options, startedAt, resolve, reject };
      try {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          if (destroyed) return;
          if (pendingStart) {
            const pending = pendingStart;
            pendingStart = null;
            session = createRunSession(pending.options, pending.startedAt);
            const next = publish(ingestRunPosition(session, position, Date.now()));
            startBrowserClock();
            pending.resolve(next);
            return;
          }
          if (session?.status === "running") publish(ingestRunPosition(session, position, Date.now()));
        },
        (error) => {
          if (pendingStart) {
            const pending = pendingStart;
            pendingStart = null;
            stopBrowserWatch();
            pending.reject(asError(error));
          } else if (session?.status === "running") {
            session = { ...pauseRun(session), gpsStatus: "poor" };
            publish(session);
            stopBrowserWatch();
          }
          fail(error);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
      );
      } catch (error) {
        pendingStart = null;
        fail(error);
        reject(asError(error));
      }
    });
  }

  return {
    async getState() {
      if (native) {
        try { await initializeNative(); session = unwrap(await RunningTracker.getState()); }
        catch (error) { fail(error); throw error; }
      } else if (session?.status === "running") {
        session = advanceRun(session, Date.now());
      }
      syncNativeClock(session);
      return result();
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("구독 함수가 필요합니다.");
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    start(options) {
      if (native) return nativeCommand("start", options);
      try { return startBrowser(options); } catch (error) { fail(error); return Promise.reject(error); }
    },
    pause() {
      if (native) return nativeCommand("pause");
      stopBrowserWatch();
      stopBrowserClock();
      return Promise.resolve(publish(pauseRun(session)));
    },
    resume() {
      if (native) return nativeCommand("resume");
      if (session?.mode === "outdoor" && session.status === "paused") {
        if (!globalThis.navigator?.geolocation) {
          const error = new Error("이 브라우저에서는 GPS 위치 기능을 사용할 수 없습니다.");
          fail(error);
          return Promise.reject(error);
        }
        return new Promise((resolve, reject) => {
          let resumeOnFix = true;
          pendingResume = { resolve, reject };
          try {
            watchId = navigator.geolocation.watchPosition(
              (position) => {
                if (destroyed) return;
                if (resumeOnFix) { session = resumeRun(session); resumeOnFix = false; startBrowserClock(); }
                if (session?.status === "running") {
                  const state = publish(ingestRunPosition(session, position, Date.now()));
                  if (pendingResume) { pendingResume.resolve(state); pendingResume = null; }
                }
              },
              (error) => {
                if (session?.status === "running") session = pauseRun(session);
                session = { ...session, gpsStatus: "poor" };
                publish(session);
                stopBrowserWatch();
                if (pendingResume) { pendingResume.reject(asError(error)); pendingResume = null; }
                fail(error);
              },
              { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
            );
          } catch (error) {
            pendingResume = null;
            fail(error);
            reject(asError(error));
          }
        });
      }
      if (session?.mode === "treadmill") { session = resumeRun(session); startBrowserClock(); publish(session); }
      return Promise.resolve(result());
    },
    lap() {
      if (native) return nativeCommand("lap");
      return Promise.resolve(publish(lapRun(session)));
    },
    finish(options) {
      if (native) return nativeCommand("finish", options);
      stopBrowserWatch();
      stopBrowserClock();
      return Promise.resolve(publish(finishRun(session, Date.now(), options)));
    },
    async acknowledgeFinished({ id } = {}) {
      if (session?.status !== "completed" || !id || session.id !== id) return result();
      if (native) return nativeCommand("acknowledgeFinished", { id });
      session = null;
      return publish(null);
    },
    async destroy() {
      destroyed = true;
      stopBrowserWatch();
      stopBrowserClock();
      if (pendingStart) {
        pendingStart.reject(new Error("러닝 시작이 취소되었습니다."));
        pendingStart = null;
      }
      if (pendingResume) {
        pendingResume.reject(new Error("러닝 재개가 취소되었습니다."));
        pendingResume = null;
      }
      subscribers.clear();
      if (visibilityHandler && globalThis.document?.removeEventListener) document.removeEventListener("visibilitychange", visibilityHandler);
      if (listenerHandle) {
        try { await listenerHandle.remove(); } catch (error) { fail(error); }
        listenerHandle = null;
      }
    },
  };
}
