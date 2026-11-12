import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../components/wallet/WalletProvider";
import { resolveRpcUrl } from "../config/env";
import { createRpcClient } from "../lib/rpc";
import { readClPositionSnapshot, type ClPositionSnapshot } from "../lib/clPositions";
import { selectReadView } from "../lib/readView";

export type ClPositionsView =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; snapshot: ClPositionSnapshot };

/** Read-only snapshot for the connected account; it never requests wallet writes. */
export function useClPositions(): { view: ClPositionsView; refresh: () => void } {
  const { state, network } = useWallet();
  const [tick, setTick] = useState(0);
  const [stored, setStored] = useState<{ key: string; view: ClPositionsView } | null>(null);
  const address = state.address;
  const connected = state.status === "connected" && address !== null;
  const onNetwork = state.chainId === network.chainId;
  const key = `${state.status}:${address?.toLowerCase() ?? ""}:${state.chainId ?? ""}:${network.key}:${network.chainId}:${tick}`;
  const enabled = connected && onNetwork && network.key === "testnet";

  useEffect(() => {
    if (!connected || !address || !onNetwork || network.key !== "testnet") {
      setStored({ key, view: { status: "idle" } });
      return;
    }
    let cancelled = false;
    setStored({ key, view: { status: "loading" } });
    const rpc = createRpcClient({ url: resolveRpcUrl(network) });
    void readClPositionSnapshot({ network, owner: address, rpc })
      .then((snapshot) => {
        if (!cancelled) setStored({ key, view: { status: "done", snapshot } });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStored({ key, view: {
          status: "error",
          message: error instanceof Error ? error.message : "The live CL position read failed.",
        } });
      });
    return () => {
      cancelled = true;
    };
  }, [connected, address, onNetwork, network, tick, key]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);
  return {
    view: selectReadView({ stored, currentKey: key, enabled, loading: { status: "loading" }, idle: { status: "idle" } }),
    refresh,
  };
}
