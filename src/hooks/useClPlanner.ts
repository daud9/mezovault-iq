import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "../components/wallet/WalletProvider";
import { resolveRpcUrl } from "../config/env";
import { readClPlannerSnapshot, type ClPlannerSnapshot } from "../lib/clPlanner";
import { ReadFlightCoordinator } from "../lib/readFlight";
import { createRpcClient } from "../lib/rpc";
import { useAutoRefresh } from "./useAutoRefresh";

export type ClPlannerView =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; snapshot: ClPlannerSnapshot; refreshing: boolean; refreshError: string | null };

/** Public Testnet pool reads only; no wallet connection or wallet write is requested. */
export function useClPlanner(): { view: ClPlannerView; refresh: () => void } {
  const { network } = useWallet();
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<ClPlannerView>({ status: "loading" });
  const flights = useRef<ReadFlightCoordinator | null>(null);
  if (flights.current === null) flights.current = new ReadFlightCoordinator();
  const networkRef = useRef(network);
  networkRef.current = network;
  const rpcUrl = resolveRpcUrl(network);
  const contextKey = JSON.stringify([network.key, network.chainId, rpcUrl]);

  useEffect(() => {
    const requestNetwork = networkRef.current;
    if (requestNetwork.key !== "testnet" || requestNetwork.chainId !== 31_611) {
      setView({ status: "error", message: "The CL planner is available only on Mezo Testnet (chain 31611)." });
      return;
    }
    let cancelled = false;
    const flight = flights.current!.begin(contextKey);
    if (!flight) return;
    setView((previous) => previous.status === "done"
      ? { ...previous, refreshing: true, refreshError: null }
      : { status: "loading" });

    const rpc = createRpcClient({ url: rpcUrl });
    void readClPlannerSnapshot({ network: requestNetwork, rpc })
      .then((snapshot) => {
        if (!cancelled && flights.current!.isCurrent(flight)) {
          setView({ status: "done", snapshot, refreshing: false, refreshError: null });
        }
      })
      .catch((error: unknown) => {
        if (cancelled || !flights.current!.isCurrent(flight)) return;
        const message = error instanceof Error ? error.message : "The live CL pool read failed.";
        setView((previous) => previous.status === "done"
          ? { ...previous, refreshing: false, refreshError: message }
          : { status: "error", message });
      })
      .finally(() => flights.current!.finish(flight));

    return () => {
      cancelled = true;
      flights.current!.cancel(flight);
    };
  }, [contextKey, rpcUrl, tick]);

  const refresh = useCallback(() => {
    flights.current!.cancelContext(contextKey);
    setTick((value) => value + 1);
  }, [contextKey]);
  const autoRefresh = useCallback(() => {
    if (flights.current!.isActive(contextKey)) return;
    setTick((value) => value + 1);
  }, [contextKey]);
  useAutoRefresh(autoRefresh, 60_000, network.key === "testnet" && network.chainId === 31_611);
  return { view, refresh };
}
