import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../components/wallet/WalletProvider";
import { resolveRpcUrl } from "../config/env";
import { TESTNET_BASIC_POOLS } from "../config/pools";
import { createRpcClient } from "../lib/rpc";
import { readPoolMarket, type PoolMarketResult } from "../lib/pool";

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
      const results: { poolId: string; result: PoolMarketResult }[] = [];
      for (const pool of TESTNET_BASIC_POOLS) {
        results.push({ poolId: pool.id, result: await readPoolMarket({ network, pool, rpc }) });
      }
      if (!cancelled) setView({ status: "done", results });
    })();
    return () => {
      cancelled = true;
    };
  }, [network, tick]);

  const refresh = useCallback(() => setTick((current) => current + 1), []);
  return { view, refresh };
}
