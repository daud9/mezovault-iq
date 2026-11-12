import { useCallback, useEffect, useState } from "react";
import { useWallet } from "../components/wallet/WalletProvider";
import { resolveRpcUrl } from "../config/env";
import { readBtcUsdPrice, type BtcUsdPriceResult } from "../lib/portfolioPrice";
import { createRpcClient } from "../lib/rpc";

export type BtcUsdPriceView = { status: "idle" } | { status: "loading" } | { status: "done"; result: BtcUsdPriceResult };

/** Read-only BTC/USD price for the partial wallet estimate on Overview. */
export function useBtcUsdPrice(): { view: BtcUsdPriceView; refresh: () => void; nowMs: number } {
  const { state, network } = useWallet();
  const [tick, setTick] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [view, setView] = useState<BtcUsdPriceView>({ status: "idle" });

  const connected = state.status === "connected";
  const onNetwork = state.chainId === network.chainId;

  useEffect(() => {
    const updateNow = () => setNowMs(Date.now());
    const timer = window.setInterval(updateNow, 10_000);
    document.addEventListener("visibilitychange", updateNow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", updateNow);
    };
  }, []);

  useEffect(() => {
    if (!connected || !onNetwork) {
      setView({ status: "idle" });
      return;
    }

    let cancelled = false;
    setView({ status: "loading" });
    const rpc = createRpcClient({ url: resolveRpcUrl(network) });
    readBtcUsdPrice({ network, rpc }).then((result) => {
      if (!cancelled) setView({ status: "done", result });
    });

    return () => {
      cancelled = true;
    };
  }, [connected, onNetwork, network, tick]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);
  return { view, refresh, nowMs };
}
