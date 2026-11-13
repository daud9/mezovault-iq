import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { DataStatus } from "../ui/DataStatus";
import { OpenTrovePlanner } from "./OpenTrovePlanner";
import { OpenTroveAction } from "./OpenTroveAction";
import { AddCollateralAction } from "./AddCollateralAction";
import { useWallet } from "../wallet/WalletProvider";
import { useLoan } from "../../hooks/useLoan";
import { useOpenTroveSnapshot } from "../../hooks/useOpenTroveSnapshot";
import { formatTime } from "../../lib/format";
import { isLoanPriceFresh, isLoanReadFresh, loanReadAgeMs } from "../../lib/loan";
import { calculateCollateralRatioBps, formatPercentBps } from "../../lib/troveRisk";

/** Read-only Trove summary and separate wallet-confirmed Testnet actions. */
export function LoanCard() {
  const { state, network, isSupportedNetwork } = useWallet();
  const { view, refresh } = useLoan();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [plannerExpanded, setPlannerExpanded] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);

  const loan = view.status === "done" && view.result.status === "ok" ? view.result : null;
  const readFresh = loan ? isLoanReadFresh(loan, nowMs) : false;
  const priceFresh = loan?.hasLoan ? isLoanPriceFresh(loan, nowMs) : false;
  const ratioBps = loan?.hasLoan && priceFresh && loan.btcUsdWei !== null
    ? calculateCollateralRatioBps({ collateralBtcWei: loan.collateralRaw, debtMusdWei: loan.debtRaw, btcUsdWei: loan.btcUsdWei })
    : null;
  const plannerEnabled = loan !== null && readFresh && !loan.hasLoan && plannerExpanded;
  const { view: plannerView, refresh: refreshPlanner } = useOpenTroveSnapshot(plannerEnabled);
  const [plannerCollateralBtc, setPlannerCollateralBtc] = useState("");
  const [plannerRequestedMusd, setPlannerRequestedMusd] = useState("");
  const plannerSnapshot = plannerView.status === "done" && plannerView.result.status === "ok"
    ? plannerView.result.snapshot
    : null;
  const plannerUnavailableReason = plannerView.status === "idle"
    ? "Open this section to check current Mezo Testnet conditions."
    : plannerView.status === "done" && plannerView.result.status !== "ok"
      ? plannerView.result.status === "error"
        ? plannerView.result.message
        : plannerView.result.status === "not-configured"
          ? plannerView.result.reason
          : "The RPC reports a different network. No planner values are shown."
      : undefined;

  let body: ReactNode;
  if (state.status !== "connected") {
    body = <p className="text-sm text-mist-400">Connect a wallet to see whether it has a Trove.</p>;
  } else if (!isSupportedNetwork) {
    body = <p className="text-sm text-mist-400">Switch to {network.label} to read your Trove.</p>;
  } else if (view.status === "idle" || view.status === "loading") {
    body = <p className="text-sm text-mist-400" role="status">Checking your Trove…</p>;
  } else if (view.status === "wrong-network") {
    body = <DataStatus state="unverified" detail={`wallet chain ${view.actualChainId ?? "unknown"}; expected ${view.expectedChainId}`} />;
  } else {
    const result = view.result;
    if (result.status === "ok" && !result.hasLoan) {
      body = !readFresh ? (
        <div className="space-y-3">
          <DataStatus state="unverified" detail="the last read is out of date" />
          <p className="text-sm text-mist-400">The last read found no active Trove, but that may have changed. Refresh before acting.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <DataStatus state="live" detail="no active Trove" />
          <p className="text-base font-semibold text-mist-100">No active Trove was found for this wallet.</p>
          <p className="text-sm text-mist-400">If you meant to add BTC to an existing Trove, this wallet does not currently have one on {network.label}.</p>
          <details
            className="rounded-lg border border-line bg-ink-800/40 px-3"
            onToggle={(event) => setPlannerExpanded(event.currentTarget.open)}
          >
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-gold-300">Want to open a new Trove instead?</summary>
            <div className="space-y-4 pb-4">
              <p className="text-sm text-mist-400">This is optional. Opening a new Trove requires BTC collateral and creates MUSD debt.</p>
              <OpenTrovePlanner
                live={plannerSnapshot}
                loading={plannerView.status === "loading"}
                unavailableReason={plannerUnavailableReason}
                collateralBtc={plannerCollateralBtc}
                requestedMusd={plannerRequestedMusd}
                onCollateralBtcChange={setPlannerCollateralBtc}
                onRequestedMusdChange={setPlannerRequestedMusd}
              />
              <OpenTroveAction
                collateralBtc={plannerCollateralBtc}
                requestedMusd={plannerRequestedMusd}
                onConfirmed={() => { refresh(); refreshPlanner(); }}
              />
            </div>
          </details>
        </div>
      );
    } else if (result.status === "ok") {
      const readAgeMs = loanReadAgeMs(result, nowMs);
      body = (
        <div className="space-y-4">
          {!readFresh ? (
            <DataStatus state="unverified" detail={`last Trove read is old${readAgeMs === null ? "" : ` · ${Math.floor(readAgeMs / 1_000)}s ago`}`} />
          ) : (
            <DataStatus state="live" detail="active Trove found" />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Metric label="BTC collateral" value={`${result.collateralBtc} BTC`} />
            <Metric label="MUSD borrowed" value={`${result.debtMusd} MUSD`} />
          </div>
          {readFresh ? (
            <AddCollateralAction onConfirmed={() => { refresh(); refreshPlanner(); }} />
          ) : (
            <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-sm text-amber-200">Refresh to confirm this Trove before adding BTC.</p>
              <Button variant="secondary" onClick={refresh} className="min-h-11">Refresh Trove</Button>
            </div>
          )}
          <details className="rounded-lg border border-line bg-ink-800/40 px-3">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-mist-300">Details</summary>
            <div className="space-y-3 pb-4 text-sm text-mist-400">
              <p>Collateral ratio: <span className="text-mist-100">{!readFresh || !priceFresh || ratioBps === null ? "Unavailable" : formatPercentBps(ratioBps)}</span>. This is information only, not a safe/at-risk verdict.</p>
              {priceFresh && result.collateralValueUsd !== null && <p>Estimated collateral value: <span className="text-mist-100">${result.collateralValueUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>, using Mezo’s BTC/USD price.</p>}
              {!priceFresh && <p>The BTC/USD price is stale or unavailable, so the collateral ratio is hidden. {result.riskInputsError ?? "Refresh after the oracle is healthy."}</p>}
              {priceFresh && result.mcrWei === null && result.riskInputsError && <p>Live MCR comparison is unavailable: {result.riskInputsError}</p>}
              <p>Price and Trove reads were taken at block {result.blockNumber} · read {formatTime(result.retrievedAt)}{result.priceAgeSeconds === null ? "; oracle age unavailable" : ` · oracle update ${result.priceAgeSeconds}s old`}.</p>
              <Link to="/app/trove-risk" className="inline-flex min-h-11 items-center font-medium text-gold-300 hover:underline">Open Trove Risk Lab</Link>
              <p>Adding BTC is the only Trove-management action available here. Borrowing more, repaying, withdrawing, closing, and liquidation are not available.</p>
            </div>
          </details>
        </div>
      );
    } else if (result.status === "not-configured") {
      body = <DataStatus state="not-configured" detail={result.reason} />;
    } else if (result.status === "wrong-network") {
      body = <p className="text-sm text-mist-400">The RPC reports a different network. No Trove is shown.</p>;
    } else {
      body = (
        <div className="space-y-3">
          <DataStatus state="unavailable" />
          <p className="text-sm text-mist-400">{result.message} No substitute value is shown.</p>
        </div>
      );
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Your Trove</p>
          <p className="mt-1 text-sm text-mist-400">BTC collateral · MUSD debt</p>
        </div>
        {state.status === "connected" && isSupportedNetwork && (
          <Button variant="ghost" onClick={() => { refresh(); refreshPlanner(); }} className="min-h-11 px-2" aria-label="Refresh Trove">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </Button>
        )}
      </div>
      {body}
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
