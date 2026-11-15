export type AutoRefreshEvent = "focus" | "visibilitychange";

export interface AutoRefreshEnvironment {
  setInterval(callback: () => void, delayMs: number): unknown;
  clearInterval(handle: unknown): void;
  addListener(event: AutoRefreshEvent, listener: () => void): void;
  removeListener(event: AutoRefreshEvent, listener: () => void): void;
  isVisible(): boolean;
  now(): number;
}

export interface AutoRefreshOptions {
  intervalMs: number;
  wakeThrottleMs?: number;
}

export const AUTO_REFRESH_WAKE_THROTTLE_MS = 15_000;

export function shouldRefreshOnWake(lastWakeAtMs: number, nowMs: number, throttleMs = AUTO_REFRESH_WAKE_THROTTLE_MS): boolean {
  if (!Number.isFinite(nowMs) || !Number.isFinite(throttleMs) || throttleMs < 0) return false;
  return lastWakeAtMs === Number.NEGATIVE_INFINITY || nowMs - lastWakeAtMs >= throttleMs;
}

const browserEnvironment: AutoRefreshEnvironment = {
  setInterval: (callback, delayMs) => window.setInterval(callback, delayMs),
  clearInterval: (handle) => window.clearInterval(handle as number),
  addListener: (event, listener) => {
    if (event === "focus") window.addEventListener("focus", listener);
    else document.addEventListener("visibilitychange", listener);
  },
  removeListener: (event, listener) => {
    if (event === "focus") window.removeEventListener("focus", listener);
    else document.removeEventListener("visibilitychange", listener);
  },
  isVisible: () => document.visibilityState === "visible",
  now: () => Date.now(),
};

/** Polls only while the page is visible and refreshes once on focus/return, with duplicate wake events throttled. */
export function startAutoRefresh(
  refresh: () => void,
  options: AutoRefreshOptions,
  environment: AutoRefreshEnvironment = browserEnvironment,
): () => void {
  if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) throw new Error("Automatic refresh interval must be positive.");
  const wakeThrottleMs = options.wakeThrottleMs ?? AUTO_REFRESH_WAKE_THROTTLE_MS;
  let lastWakeAtMs = Number.NEGATIVE_INFINITY;
  const interval = environment.setInterval(() => {
    if (environment.isVisible()) refresh();
  }, options.intervalMs);
  const onWake = () => {
    if (!environment.isVisible()) return;
    const nowMs = environment.now();
    if (!shouldRefreshOnWake(lastWakeAtMs, nowMs, wakeThrottleMs)) return;
    lastWakeAtMs = nowMs;
    refresh();
  };
  environment.addListener("focus", onWake);
  environment.addListener("visibilitychange", onWake);
  return () => {
    environment.clearInterval(interval);
    environment.removeListener("focus", onWake);
    environment.removeListener("visibilitychange", onWake);
  };
}
