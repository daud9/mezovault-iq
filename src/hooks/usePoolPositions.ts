import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../components/wallet/WalletProvider";
import { resolveRpcUrl } from "../config/env";
import { TESTNET_BASIC_POOLS } from "../config/pools";
import { createRpcClient } from "../lib/rpc";
import { readPoolPosition, type PoolResult } from "../lib/pool";

export type PoolsView =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; results: { poolId: string; result: PoolResult }[] };

/** Reads the wallet's share of each verified testnet basic pool, one after another. */
export function usePoolPositions(): { view: PoolsView; refresh: () => void } {
  const { state, network } = useWallet();
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<PoolsView>({ status: "idle" });

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
    (async () => {
      const results: { poolId: string; result: PoolResult }[] = [];
      for (const pool of TESTNET_BASIC_POOLS) {
        results.push({ poolId: pool.id, result: await readPoolPosition({ network, pool, owner: address, rpc }) });
      }
      if (!cancelled) setView({ status: "done", results });
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, address, onNetwork, network, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { view, refresh };
}
