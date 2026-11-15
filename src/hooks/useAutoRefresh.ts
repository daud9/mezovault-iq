import { useEffect, useRef } from "react";
import { startAutoRefresh } from "../lib/autoRefresh";

/** Automatically re-runs a safe read while enabled, on a conservative interval and when the page returns. */
export function useAutoRefresh(refresh: () => void, intervalMs: number, enabled = true): void {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    return startAutoRefresh(() => refreshRef.current(), { intervalMs });
  }, [enabled, intervalMs]);
}
