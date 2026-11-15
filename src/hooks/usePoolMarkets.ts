import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../components/wallet/WalletProvider";
import { resolveRpcUrl } from "../config/env";
import { TESTNET_BASIC_POOLS } from "../config/pools";
import { createRpcClient } from "../lib/rpc";
import { readPoolMarket, type PoolMarketResult } from "../lib/pool";
import { readSnapshotBlock } from "../lib/readSnapshotBlock";
import { parseChainId } from "../lib/network";
import { useAutoRefresh } from "./useAutoRefresh";

export type PoolMarketsView =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; results: { poolId: string; result: PoolMarketResult }[] };

/** Reads official testnet pool reserves without requiring a connected wallet. */
export function usePoolMarkets(): { view: PoolMarketsView; refresh: () => void } {
  const { network } = useWallet();
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<PoolMarketsView>({ status: "idle" });

  useEffect(() => {
    if (network.key !== "testnet") {
      setView({ status: "idle" });
      return;
    }
    let cancelled = false;
    setView({ status: "loading" });
    const rpc = createRpcClient({ url: resolveRpcUrl(network) });
    (async () => {
      let results: { poolId: string; result: PoolMarketResult }[];
      try {
        const chainId = parseChainId(await rpc.call<string>("eth_chainId"));
        if (chainId !== network.chainId) {
          results = TESTNET_BASIC_POOLS.map((pool) => ({
            poolId: pool.id,
            result: { status: "wrong-network", actualChainId: chainId, expectedChainId: network.chainId },
          }));
        } else {
          const block = await readSnapshotBlock(rpc);
          const snapshot = { ...block, chainId };
          results = await Promise.all(TESTNET_BASIC_POOLS.map(async (pool) => ({
            poolId: pool.id,
            result: await readPoolMarket({ network, pool, rpc, snapshot }),
          })));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "A common pool snapshot could not be read.";
        results = TESTNET_BASIC_POOLS.map((pool) => ({
          poolId: pool.id,
          result: { status: "error", kind: "snapshot", message },
        }));
      }
      if (!cancelled) setView({ status: "done", results });
    })();
    return () => {
      cancelled = true;
    };
  }, [network, tick]);

  const refresh = useCallback(() => setTick((current) => current + 1), []);
  useAutoRefresh(refresh, 120_000, network.key === "testnet");
  return { view, refresh };
}
