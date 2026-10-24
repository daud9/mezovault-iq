import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../components/wallet/WalletProvider";
import { resolveRpcUrl } from "../config/env";
import { readMusdBalance, type MusdBalanceResult } from "../lib/musd";
import { createRpcClient } from "../lib/rpc";

export type MusdView =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: MusdBalanceResult };

/**
 * Reads the connected wallet's MUSD balance once per connection, per network, and per refresh.
 * It does not read when the wallet is disconnected or on a different network, so no
 * request is sent that could not succeed.
 */
export function useMusdBalance(): { view: MusdView; refresh: () => void } {
  const { state, network } = useWallet();
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<MusdView>({ status: "idle" });

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
    readMusdBalance({ network, owner: address, rpc }).then((result) => {
      if (!cancelled) setView({ status: "done", result });
    });

    return () => {
      cancelled = true;
    };
  }, [connected, address, onNetwork, network, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { view, refresh };
}
