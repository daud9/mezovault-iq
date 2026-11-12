import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../components/wallet/WalletProvider";
import { resolveRpcUrl } from "../config/env";
import { readNativeBalance, type NativeBalanceResult } from "../lib/nativeBalance";
import { createRpcClient } from "../lib/rpc";
import { selectReadView } from "../lib/readView";

export type NativeView = { status: "idle" } | { status: "loading" } | { status: "done"; result: NativeBalanceResult };

/** Reads the connected wallet's BTC gas balance. Same connection rules as the MUSD hook. */
export function useNativeBalance(): { view: NativeView; refresh: () => void } {
  const { state, network } = useWallet();
  const [tick, setTick] = useState(0);
  const [stored, setStored] = useState<{ key: string; view: NativeView } | null>(null);

  const address = state.address;
  const connected = state.status === "connected" && address !== null;
  const onNetwork = state.chainId === network.chainId;
  const key = `${state.status}:${address?.toLowerCase() ?? ""}:${state.chainId ?? ""}:${network.key}:${network.chainId}:${tick}`;

  useEffect(() => {
    if (!connected || !address || !onNetwork) {
      setStored({ key, view: { status: "idle" } });
      return;
    }
    let cancelled = false;
    setStored({ key, view: { status: "loading" } });
    const rpc = createRpcClient({ url: resolveRpcUrl(network) });
    readNativeBalance({ network, owner: address, rpc }).then((result) => {
      if (!cancelled) setStored({ key, view: { status: "done", result } });
    });
    return () => {
      cancelled = true;
    };
  }, [connected, address, onNetwork, network, tick, key]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return {
    view: selectReadView({ stored, currentKey: key, enabled: connected && onNetwork, loading: { status: "loading" }, idle: { status: "idle" } }),
    refresh,
  };
}
