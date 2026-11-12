import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../components/wallet/WalletProvider";
import { resolveRpcUrl } from "../config/env";
import { createRpcClient } from "../lib/rpc";
import { readClPositionSnapshot, type ClPositionSnapshot } from "../lib/clPositions";

export type ClPositionsView =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; snapshot: ClPositionSnapshot };

/** Read-only snapshot for the connected account; it never requests wallet writes. */
export function useClPositions(): { view: ClPositionsView; refresh: () => void } {
  const { state, network } = useWallet();
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<ClPositionsView>({ status: "idle" });
  const address = state.address;
  const connected = state.status === "connected" && address !== null;
  const onNetwork = state.chainId === network.chainId;

  useEffect(() => {
    if (!connected || !address || !onNetwork || network.key !== "testnet") {
      setView({ status: "idle" });
      return;
    }
    let cancelled = false;
    setView({ status: "loading" });
    const rpc = createRpcClient({ url: resolveRpcUrl(network) });
    void readClPositionSnapshot({ network, owner: address, rpc })
      .then((snapshot) => {
        if (!cancelled) setView({ status: "done", snapshot });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setView({
          status: "error",
          message: error instanceof Error ? error.message : "The live CL position read failed.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [connected, address, onNetwork, network, tick]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);
  return { view, refresh };
}
