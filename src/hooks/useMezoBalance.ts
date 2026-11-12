import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../components/wallet/WalletProvider";
import { resolveRpcUrl } from "../config/env";
import { readErc20Balance, type Erc20BalanceResult } from "../lib/erc20";
import { createRpcClient } from "../lib/rpc";
import { selectReadView } from "../lib/readView";

export type MezoView = { status: "idle" } | { status: "loading" } | { status: "done"; result: Erc20BalanceResult };

/** Reads the connected wallet's MEZO balance. Same connection rules as the other balance hooks. */
export function useMezoBalance(): { view: MezoView; refresh: () => void } {
  const { state, network } = useWallet();
  const [tick, setTick] = useState(0);
  const [stored, setStored] = useState<{ key: string; view: MezoView } | null>(null);

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
    readErc20Balance({ network, token: network.mezo, owner: address, rpc }).then((result) => {
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
