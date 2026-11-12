import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { DataStatus } from "../ui/DataStatus";
import { useWallet } from "../wallet/WalletProvider";
import { useNativeBalance } from "../../hooks/useNativeBalance";
import { useBtcUsdPrice } from "../../hooks/useBtcUsdPrice";
import { formatTime } from "../../lib/format";
import {
  btcUsdPriceAgeSeconds,
  estimateBtcBalanceUsd,
  isBtcUsdPriceFresh,
  MAX_BTC_USD_AGE_SECONDS,
} from "../../lib/portfolioPrice";

/** Native BTC gas balance for the connected wallet, read from the RPC. */
export function BtcBalanceCard() {
  const { state, network, isSupportedNetwork } = useWallet();
  const { view, refresh } = useNativeBalance();
  const { view: priceView, refresh: refreshPrice, nowMs } = useBtcUsdPrice();

  let body: ReactNode;
  if (state.status !== "connected") {
    body = <p className="text-sm text-mist-400">Connect a wallet to read its BTC balance.</p>;
  } else if (!isSupportedNetwork) {
    body = <p className="text-sm text-mist-400">Switch to {network.label} to read the BTC balance.</p>;
  } else if (view.status === "idle" || view.status === "loading") {
    body = <p className="text-sm text-mist-400" role="status">Reading BTC balance…</p>;
  } else if (view.result.status === "ok") {
    const r = view.result;
    body = (
      <div className="space-y-2">
        <p className="text-2xl font-semibold text-mist-100">
          {r.formatted} <span className="text-base font-medium text-gold-300">{r.symbol}</span>
        </p>
        <p className="text-xs text-mist-500">
          Exact: {r.exact} {r.symbol} · block {r.blockNumber} · retrieved {formatTime(r.retrievedAt)}
        </p>
        <p className="text-xs text-mist-500">Source: {network.label} RPC (eth_getBalance). This is the native gas balance.</p>
      </div>
    );
  } else if (view.result.status === "wrong-network") {
    body = <p className="text-sm text-mist-400">The RPC reports a different network. No balance is shown.</p>;
  } else {
    body = (
      <div className="space-y-3">
        <DataStatus state="unavailable" />
        <p className="text-sm text-mist-400">{view.result.message} No substitute value is shown.</p>
      </div>
    );
  }

  let btcEstimate: ReactNode = null;
  if (
    state.status === "connected" &&
    isSupportedNetwork &&
    view.status === "done" &&
    view.result.status === "ok"
  ) {
    if (priceView.status === "done" && priceView.result.status === "ok") {
      const price = priceView.result;
      const ageSeconds = btcUsdPriceAgeSeconds(price, nowMs);
      if (isBtcUsdPriceFresh(price, nowMs)) {
        const estimatedUsd = estimateBtcBalanceUsd(view.result.balanceRaw, price.priceUsdWad);
        btcEstimate = (
          <div className="space-y-2 rounded-lg border border-line bg-ink-800/60 p-3">
            <p className="text-sm font-semibold text-mist-100">BTC-only estimate: ≈ ${estimatedUsd}</p>
            <DataStatus state="live" detail={`BTC/USD oracle · ${ageSeconds}s old · block ${price.blockNumber}`} />
            <p className="text-xs leading-relaxed text-mist-500">
              Uses this wallet’s native BTC balance and Mezo’s on-chain BTC/USD price. It is not a portfolio total; MUSD, MEZO, and DeFi positions are excluded.
            </p>
            <p className="text-xs text-mist-500">Oracle updated {formatTime(new Date(price.updatedAt * 1_000).toISOString())}.</p>
          </div>
        );
      } else {
        btcEstimate = (
          <div className="space-y-2">
            <DataStatus state="unavailable" detail="BTC/USD price expired" />
            <p className="text-xs text-mist-500">
              The last oracle update is older than the {MAX_BTC_USD_AGE_SECONDS.toLocaleString()}-second freshness limit. Refresh to check again; no USD estimate is shown.
            </p>
          </div>
        );
      }
    } else if (priceView.status === "loading" || priceView.status === "idle") {
      btcEstimate = <p className="text-xs text-mist-500" role="status">Checking the Mezo BTC/USD oracle; no USD estimate is shown until its freshness is verified.</p>;
    } else {
      btcEstimate = (
        <div className="space-y-2">
          <DataStatus state="unavailable" detail="BTC/USD estimate unavailable" />
          <p className="text-xs text-mist-500">The BTC balance remains visible in BTC. No substitute price is used.</p>
        </div>
      );
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Wallet BTC (gas)</p>
          <p className="mt-1 text-sm text-mist-400">Native balance on {network.label}</p>
        </div>
        {state.status === "connected" && isSupportedNetwork && (
          <Button
            variant="ghost"
            onClick={() => {
              refresh();
              refreshPrice();
            }}
            className="min-h-11 px-2"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </Button>
        )}
      </div>
      {body}
      {btcEstimate}
    </Card>
  );
}
