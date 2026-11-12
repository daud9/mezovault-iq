import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useWallet } from "../wallet/WalletProvider";
import { useLoan } from "../../hooks/useLoan";
import { isLoanPriceFresh, isLoanReadFresh, loanReadAgeMs } from "../../lib/loan";
import { calculateCollateralRatioBps, formatPercentBps } from "../../lib/troveRisk";
import { formatTime } from "../../lib/format";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { DataStatus } from "../ui/DataStatus";

/** A read-only summary for Overview; it never renders the open-Trove action. */
export function TrovePositionCard() {
  const { state, network } = useWallet();
  const { view, refresh } = useLoan();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  const connected = state.status === "connected" && state.address !== null;
  const walletOnNetwork = connected && state.chainId === network.chainId;
  const result = view.status === "done" && view.result.status === "ok" ? view.result : null;
  const readFresh = result ? isLoanReadFresh(result, nowMs) : false;
  const priceFresh = result?.hasLoan ? isLoanPriceFresh(result, nowMs) : false;
  const readAgeMs = result ? loanReadAgeMs(result, nowMs) : null;
  const ratioBps = result && result.hasLoan && priceFresh && result.btcUsdWei !== null
    ? calculateCollateralRatioBps({
        collateralBtcWei: result.collateralRaw,
        debtMusdWei: result.debtRaw,
        btcUsdWei: result.btcUsdWei,
      })
    : null;

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Current MUSD loan</p>
          <p className="mt-1 text-sm text-mist-400">Connected wallet · {network.label}</p>
        </div>
        {walletOnNetwork && (
          <Button variant="ghost" onClick={refresh} className="min-h-11 px-2" aria-label="Refresh Trove read">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </Button>
        )}
      </div>

      {!connected ? (
        <div className="space-y-2">
          <DataStatus state="not-configured" detail="wallet required" />
          <p className="text-sm text-mist-400">Connect a wallet to check whether it has an active MUSD Trove.</p>
        </div>
      ) : !walletOnNetwork || view.status === "wrong-network" ? (
        <div className="space-y-2">
          <DataStatus state="unverified" detail="wrong wallet network" />
          <p className="text-sm text-mist-400">The connected wallet is on chain {state.chainId ?? "unknown"}. Switch to {network.label} (chain {network.chainId}); no loan status is inferred for another network.</p>
        </div>
      ) : view.status === "idle" || view.status === "loading" ? (
        <p className="text-sm text-mist-400" role="status">Reading the current Trove from {network.label}…</p>
      ) : view.result.status === "wrong-network" ? (
        <div className="space-y-2">
          <DataStatus state="unavailable" detail="RPC network mismatch" />
          <p className="text-sm text-mist-400">The RPC is on chain {view.result.actualChainId ?? "unknown"}, not the configured chain {view.result.expectedChainId}. No loan status is shown.</p>
        </div>
      ) : view.result.status === "not-configured" ? (
        <DataStatus state="not-configured" detail={view.result.reason} />
      ) : view.result.status === "error" ? (
        <div className="space-y-2">
          <DataStatus state="unavailable" detail="position read failed" />
          <p className="text-sm text-mist-400">{view.result.message} No zero-value or cached position is substituted.</p>
        </div>
      ) : result && !readFresh ? (
        <div className="space-y-3">
          <DataStatus state="unverified" detail="Trove read is stale" />
          <p className="text-sm text-mist-400">The last pinned-block read was {readAgeMs === null ? "at an unknown age" : `${Math.floor(readAgeMs / 1_000)} seconds ago`}, at block {result.blockNumber}. Refresh to confirm the current position; this card does not treat the cached result as current.</p>
          {result.hasLoan && <LastReadPosition collateral={result.collateralBtc} debt={result.debtMusd} />}
          {!result.hasLoan && <p className="text-sm text-mist-300">That stale read found no active Trove, but current no-loan status is unverified.</p>}
        </div>
      ) : result && !result.hasLoan ? (
        <div className="space-y-2">
          <DataStatus state="live" detail={`no active Trove · block ${result.blockNumber}`} />
          <p className="text-sm font-semibold text-mist-100">No active Trove was found for this wallet.</p>
          <p className="text-xs text-mist-500">Pinned-block read: {formatTime(result.retrievedAt)} · the planner is available on the Trove page if you choose to review an opening.</p>
        </div>
      ) : result ? (
        <div className="space-y-4">
          <DataStatus state="live" detail={`active Trove · block ${result.blockNumber}`} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Collateral" value={`${result.collateralBtc} BTC`} />
            <Metric label="Debt" value={`${result.debtMusd} MUSD`} />
            <Metric label="Current collateral ratio" value={ratioBps === null ? "Unavailable" : formatPercentBps(ratioBps)} />
            <Metric label="Live MCR" value={result.mcrWei === null ? "Unavailable" : formatPercentBps((result.mcrWei * 10_000n) / (10n ** 18n))} />
          </div>
          {!priceFresh && (
            <p className="text-xs leading-relaxed text-mist-500">The BTC/USD oracle is stale or unavailable, so no current collateral ratio is shown. {result.riskInputsError ?? "Refresh after the oracle is healthy."}</p>
          )}
          {priceFresh && result.mcrWei === null && result.riskInputsError && (
            <p className="text-xs leading-relaxed text-mist-500">The collateral ratio uses the fresh Mezo BTC/USD price. The MCR comparison is unavailable: {result.riskInputsError}</p>
          )}
          <p className="text-xs text-mist-500">Trove, price and MCR reads use block {result.blockNumber}. Retrieved {formatTime(result.retrievedAt)}{result.priceAgeSeconds === null ? "; oracle freshness unavailable" : `; oracle update age ${result.priceAgeSeconds}s at that block`}.</p>
        </div>
      ) : null}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-ink-800/50 p-3">
      <p className="text-xs text-mist-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-mist-100">{value}</p>
    </div>
  );
}

function LastReadPosition({ collateral, debt }: { collateral: string; debt: string }) {
  return <p className="text-xs text-mist-500">Last observed only (not current): {collateral} BTC collateral · {debt} MUSD debt.</p>;
}
