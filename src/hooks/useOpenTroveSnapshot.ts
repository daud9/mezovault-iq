import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../components/wallet/WalletProvider";
import { resolveRpcUrl } from "../config/env";
import { readOpenTroveSnapshot, type OpenTroveSnapshotResult } from "../lib/openTroveRead";
import { createRpcClient } from "../lib/rpc";

export type OpenTroveSnapshotView =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: OpenTroveSnapshotResult };

/** Reads a same-block, read-only Mezo Testnet parameter snapshot for the connected wallet. */
export function useOpenTroveSnapshot(enabled = true): { view: OpenTroveSnapshotView; refresh: () => void } {
  const { state, network } = useWallet();
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<OpenTroveSnapshotView>({ status: "idle" });

  const address = state.address;
  const connected = state.status === "connected" && address !== null;
  const onNetwork = state.chainId === network.chainId;

  useEffect(() => {
    if (!enabled || !connected || !address || !onNetwork || network.key !== "testnet") {
      setView({ status: "idle" });
      return;
    }
    let cancelled = false;
    setView({ status: "loading" });
    const rpc = createRpcClient({ url: resolveRpcUrl(network) });
    readOpenTroveSnapshot({ network, owner: address, rpc }).then((result) => {
      if (!cancelled) setView({ status: "done", result });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, connected, address, onNetwork, network, tick]);

  const refresh = useCallback(() => setTick((current) => current + 1), []);
  return { view, refresh };
}
