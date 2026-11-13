import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../components/wallet/WalletProvider";
import { resolveRpcUrl } from "../config/env";
import { TESTNET_POOL_BTC_TOKEN } from "../config/pools";
import { readErc20Balance, type Erc20BalanceResult } from "../lib/erc20";
import { createRpcClient } from "../lib/rpc";
import { selectReadView } from "../lib/readView";
export type PoolBtcView = { status: "idle" } | { status: "loading" } | { status: "done"; result: Erc20BalanceResult };
/** Reads only the Mezo Testnet pool BTC ERC-20; it never treats the token as native BTC gas. */
export function usePoolBtcBalance(): { view: PoolBtcView; refresh: () => void } {
  const { state, network } = useWallet();
  const [tick, setTick] = useState(0);
  const [stored, setStored] = useState<{ key: string; view: PoolBtcView } | null>(null);
  const address = state.address;
  const connected = state.status === "connected" && address !== null;
  const onNetwork = state.chainId === 31_611 && network.key === "testnet" && network.chainId === 31_611;
  const key = `${state.status}:${address?.toLowerCase() ?? ""}:${state.chainId ?? ""}:${network.key}:${network.chainId}:${tick}`;
  useEffect(() => {
    if (!connected || !address || !onNetwork) {
      setStored({ key, view: { status: "idle" } });
      return;
    }
    let cancelled = false;
    setStored({ key, view: { status: "loading" } });
    const rpc = createRpcClient({ url: resolveRpcUrl(network) });
    readErc20Balance({
      network,
      token: { address: TESTNET_POOL_BTC_TOKEN.address, symbol: TESTNET_POOL_BTC_TOKEN.symbol },
      owner: address,
      rpc,
    }).then((result) => {
      if (!cancelled) setStored({ key, view: { status: "done", result } });
    });
    return () => {
      cancelled = true;
    };
  }, [connected, address, onNetwork, network, tick, key]);
  const refresh = useCallback(() => setTick((current) => current + 1), []);
  return {
    view: selectReadView({ stored, currentKey: key, enabled: connected && onNetwork, loading: { status: "loading" }, idle: { status: "idle" } }),
    refresh,
  };
}
