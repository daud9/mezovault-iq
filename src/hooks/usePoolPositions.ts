import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../components/wallet/WalletProvider";
import { resolveRpcUrl } from "../config/env";
import { TESTNET_BASIC_POOLS } from "../config/pools";
import { createRpcClient } from "../lib/rpc";
import { readPoolPosition, type PoolResult } from "../lib/pool";
import { selectReadView } from "../lib/readView";

export type PoolsView =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; results: { poolId: string; result: PoolResult }[] };

/** Reads the wallet's share of each verified testnet basic pool, one after another. */
export function usePoolPositions(): { view: PoolsView; refresh: () => void } {
  const { state, network } = useWallet();
  const [tick, setTick] = useState(0);
  const [stored, setStored] = useState<{ key: string; view: PoolsView } | null>(null);

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
    (async () => {
      const results: { poolId: string; result: PoolResult }[] = [];
      for (const pool of TESTNET_BASIC_POOLS) {
        results.push({ poolId: pool.id, result: await readPoolPosition({ network, pool, owner: address, rpc }) });
      }
      if (!cancelled) setStored({ key, view: { status: "done", results } });
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, address, onNetwork, network, tick, key]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return {
    view: selectReadView({ stored, currentKey: key, enabled, loading: { status: "loading" }, idle: { status: "idle" } }),
    refresh,
  };
}
