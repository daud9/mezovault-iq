import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { DataStatus } from "../components/ui/DataStatus";
import { SectionHeader } from "../components/ui/SectionHeader";
import { useWallet } from "../components/wallet/WalletProvider";
import { OFFICIAL_SOURCES } from "../config/chains";
import { usePoolMarkets } from "../hooks/usePoolMarkets";
import { explorerAddressUrl } from "../lib/explorer";
import { formatTime, shortAddress } from "../lib/format";

export function PoolWatch() {
  const { network } = useWallet();
  const { view, refresh } = usePoolMarkets();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const testnet = network.key === "testnet";
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Mezo Testnet · Read-only market data"
        title="Pool Watch"
        description="Official basic pools only. Reserves and reserve-implied spot prices are read from pool contracts; no transactions, APY estimates, or pool recommendations are offered."
        actions={testnet ? (
          <Button variant="ghost" onClick={refresh} className="min-h-11 px-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </Button>
        ) : undefined}
      />
      {!testnet ? (
        <Card className="space-y-2">
          <DataStatus state="not-configured" detail="Mezo Testnet only" />
          <p className="text-sm leading-relaxed text-mist-400">Pool Watch reads only the official Mezo Testnet pools. Switch the app network to Mezo Testnet to query them.</p>
        </Card>
      ) : view.status === "loading" || view.status === "idle" ? (
        <Card><p className="text-sm text-mist-400" role="status">Reading official pool contracts on {network.label}…</p></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {view.results.map(({ poolId, result }) => {
            if (result.status !== "ok") {
              const message = result.status === "error"
                ? result.message
                : result.status === "wrong-network"
                  ? "The RPC reports a different network; pool data is not shown."
                  : "No contract code was found at this address on the checked block.";
              return (
                <Card key={poolId} className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-mist-100">{result.status === "no-contract" ? "Pool address" : "Pool read unavailable"}</h2>
                    <DataStatus state="unavailable" />
                  </div>
                  <p className="text-sm text-mist-400">{message}</p>
                </Card>
              );
            }
            const [base, quote] = result.tokens;
            const dataAgeSeconds = Math.max(0, Math.floor((nowMs - new Date(result.retrievedAt).getTime()) / 1_000));
            return (
              <Card key={poolId} className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-mist-100">{result.pool.name}</h2>
                    <p className="mt-1 text-xs text-mist-500">Official basic pool · {result.pool.kind} pair</p>
                  </div>
                  <DataStatus state="live" detail={`block ${result.blockNumber}`} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-line bg-ink-800/50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Pool spot price</p>
                    <p className="mt-2 text-lg font-semibold text-mist-100">{result.spotPrice === null ? "Unavailable" : `${result.spotPrice} ${quote.symbol} / ${base.symbol}`}</p>
                    <p className="mt-1 text-xs text-mist-500">Reserve ratio only: 1 {base.symbol} = {result.spotPrice ?? "unavailable"} {quote.symbol}; excludes trade impact.</p>
                  </div>
                  <div className="rounded-xl border border-line bg-ink-800/50 p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Fee tier</p>
                    <p className="mt-2 text-lg font-semibold text-mist-100">Not verified</p>
                    <p className="mt-1 text-xs text-mist-500">No fee value is inferred from a pool name or router address.</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Reserves · pool depth</p>
                  <div className="grid grid-cols-2 gap-3">
                    {result.tokens.map((token) => (
                      <div key={token.address} className="rounded-xl border border-line bg-ink-800/50 p-4">
                        <p className="text-xs text-mist-500">{token.symbol}</p>
                        <p className="mt-1 break-all text-lg font-semibold text-mist-100">{token.reserveFormatted}</p>
                        <p className="mt-1 text-xs text-mist-500">{shortAddress(token.address)} · {token.decimals} decimals</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-mist-400">USD liquidity: not verified. The pool assets do not both have a verified price source in this view.</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
                  <div className="space-y-1 text-xs text-mist-500">
                    <p>Data age: {dataAgeSeconds.toLocaleString()} seconds · read {formatTime(result.retrievedAt)} · block {result.blockNumber}</p>
                    <p>Pool {shortAddress(result.poolAddress)}</p>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <a href={explorerAddressUrl(network, result.poolAddress)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-gold-300 hover:underline">
                      Explorer <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                    <a href={result.pool.source} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-gold-300 hover:underline">
                      Official source <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Card className="space-y-2 text-sm leading-relaxed text-mist-400">
        <p className="font-medium text-mist-200">How to read this page</p>
        <p>Spot price is calculated from the two reserves at the reported block. It is not a quoted execution price. Reserves are shown in their native token units; no APY, total dollar liquidity, or performance claim is made.</p>
        <a href={OFFICIAL_SOURCES.mezoPools} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-medium text-gold-300 hover:underline">
          Mezo Pools documentation <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </Card>
    </div>
  );
}
