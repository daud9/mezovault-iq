import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../components/wallet/WalletProvider";
import { resolveRpcUrl } from "../config/env";
import { readClPlannerSnapshot, type ClPlannerSnapshot } from "../lib/clPlanner";
import { createRpcClient } from "../lib/rpc";

export type ClPlannerView =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; snapshot: ClPlannerSnapshot; refreshing: boolean; refreshError: string | null };

/** Public Testnet pool reads only; no wallet connection or wallet write is requested. */
export function useClPlanner(): { view: ClPlannerView; refresh: () => void } {
  const { network } = useWallet();
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<ClPlannerView>({ status: "loading" });

  useEffect(() => {
    if (network.key !== "testnet" || network.chainId !== 31_611) {
      setView({ status: "error", message: "The CL planner is available only on Mezo Testnet (chain 31611)." });
      return;
    }
    let cancelled = false;
    setView((previous) => previous.status === "done"
      ? { ...previous, refreshing: true, refreshError: null }
      : { status: "loading" });

    const rpc = createRpcClient({ url: resolveRpcUrl(network) });
    void readClPlannerSnapshot({ network, rpc })
      .then((snapshot) => {
        if (!cancelled) setView({ status: "done", snapshot, refreshing: false, refreshError: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "The live CL pool read failed.";
        setView((previous) => previous.status === "done"
          ? { ...previous, refreshing: false, refreshError: message }
          : { status: "error", message });
      });

    return () => { cancelled = true; };
  }, [network, tick]);

  useEffect(() => {
    if (network.key !== "testnet") return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") setTick((value) => value + 1);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [network]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);
  return { view, refresh };
}
