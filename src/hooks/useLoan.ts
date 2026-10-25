import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../components/wallet/WalletProvider";
import { resolveRpcUrl } from "../config/env";
import { readLoan, type LoanResult } from "../lib/loan";
import { createRpcClient } from "../lib/rpc";

export type LoanView = { status: "idle" } | { status: "loading" } | { status: "done"; result: LoanResult };

/** Reads the connected wallet's loan position. Same connection rules as the balance hooks. */
export function useLoan(): { view: LoanView; refresh: () => void } {
  const { state, network } = useWallet();
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<LoanView>({ status: "idle" });

  const address = state.address;
  const connected = state.status === "connected" && address !== null;
  const onNetwork = state.chainId === network.chainId;

  useEffect(() => {
    if (!connected || !address || !onNetwork) {
      setView({ status: "idle" });
      return;
    }
    let cancelled = false;
    setView({ status: "loading" });
    const rpc = createRpcClient({ url: resolveRpcUrl(network) });
    readLoan({ network, owner: address, rpc }).then((result) => {
      if (!cancelled) setView({ status: "done", result });
    });
    return () => {
      cancelled = true;
    };
  }, [connected, address, onNetwork, network, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { view, refresh };
}
