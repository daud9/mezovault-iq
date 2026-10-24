import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../components/wallet/WalletProvider";
import { resolveRpcUrl } from "../config/env";
import { readNativeBalance, type NativeBalanceResult } from "../lib/nativeBalance";
import { createRpcClient } from "../lib/rpc";

export type NativeView = { status: "idle" } | { status: "loading" } | { status: "done"; result: NativeBalanceResult };

/** Reads the connected wallet's BTC gas balance. Same connection rules as the MUSD hook. */
export function useNativeBalance(): { view: NativeView; refresh: () => void } {
  const { state, network } = useWallet();
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<NativeView>({ status: "idle" });

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
    readNativeBalance({ network, owner: address, rpc }).then((result) => {
      if (!cancelled) setView({ status: "done", result });
    });
    return () => {
      cancelled = true;
    };
  }, [connected, address, onNetwork, network, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { view, refresh };
}
