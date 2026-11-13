import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { calculateMinimumOpenTroveAmounts, type OpenTroveLiveSnapshot } from "../../lib/openTrovePlanner";
import { isLoanPriceFresh, isLoanReadFresh, loanReadAgeMs } from "../../lib/loan";
import { calculateCollateralRatioBps, formatPercentBps } from "../../lib/troveRisk";
import type { ClosedTroveHistory } from "../../lib/closedTroveHistory";

/** Read-only Trove summary and separate wallet-confirmed Testnet actions. */
export function LoanCard() {
  const { state, network, isSupportedNetwork } = useWallet();
  const { view, refresh } = useLoan();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [plannerExpanded, setPlannerExpanded] = useState(false);
  const [openTroveConflictAccount, setOpenTroveConflictAccount] = useState<string | null>(null);
  const [plannerCollateralBtc, setPlannerCollateralBtc] = useState("");
  const [plannerRequestedMusd, setPlannerRequestedMusd] = useState("");
  const plannerCollateralTouched = useRef(false);
  const plannerRequestedTouched = useRef(false);
  const autoMinimums = useRef<{ accountKey: string; collateralBtc: string; requestedMusd: string } | null>(null);
  const accountKey = state.status === "connected" ? state.address?.toLowerCase() ?? "" : "";
  const previousAccountKey = useRef(accountKey);
  const openTroveConflict = Boolean(accountKey && openTroveConflictAccount === accountKey);
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (previousAccountKey.current !== accountKey) {
      previousAccountKey.current = accountKey;
      setOpenTroveConflictAccount(null);
      setPlannerCollateralBtc("");
      setPlannerRequestedMusd("");
      plannerCollateralTouched.current = false;
      plannerRequestedTouched.current = false;
      autoMinimums.current = null;
    }
  }, [accountKey]);

  const loan = view.status === "done" && view.result.status === "ok" ? view.result : null;
  const readFresh = loan ? isLoanReadFresh(loan, nowMs) : false;
  const priceFresh = loan?.hasLoan ? isLoanPriceFresh(loan, nowMs) : false;
  const ratioBps = loan?.hasLoan && priceFresh && loan.btcUsdWei !== null
    ? calculateCollateralRatioBps({ collateralBtcWei: loan.collateralRaw, debtMusdWei: loan.debtRaw, btcUsdWei: loan.btcUsdWei })
    : null;
  const plannerEnabled = loan !== null && readFresh && !loan.hasLoan && plannerExpanded && !openTroveConflict;
  const { view: plannerView, refresh: refreshPlanner } = useOpenTroveSnapshot(plannerEnabled);
  const plannerSnapshot = plannerView.status === "done" && plannerView.result.status === "ok"
    ? plannerView.result.snapshot
    : null;
  const applyMinimums = useCallback((snapshot: OpenTroveLiveSnapshot) => {
    const minimum = calculateMinimumOpenTroveAmounts(snapshot);
    if (minimum.status !== "ready") return;
    const previous = autoMinimums.current;
    const sameAccount = previous?.accountKey === accountKey;
    if (!sameAccount || !plannerCollateralTouched.current || (previous && plannerCollateralBtc === previous.collateralBtc)) {
      setPlannerCollateralBtc(minimum.collateralBtc);
      plannerCollateralTouched.current = false;
    }
    if (!sameAccount || !plannerRequestedTouched.current || (previous && plannerRequestedMusd === previous.requestedMusd)) {
      setPlannerRequestedMusd(minimum.requestedMusd);
      plannerRequestedTouched.current = false;
    }
    autoMinimums.current = { accountKey, collateralBtc: minimum.collateralBtc, requestedMusd: minimum.requestedMusd };
  }, [accountKey, plannerCollateralBtc, plannerRequestedMusd]);
  useEffect(() => {
    if (plannerSnapshot) applyMinimums(plannerSnapshot);
  }, [plannerSnapshot, applyMinimums]);
  const changePlannerCollateral = useCallback((value: string) => {
    plannerCollateralTouched.current = true;
    setPlannerCollateralBtc(value);
  }, []);
  const changePlannerRequested = useCallback((value: string) => {
    plannerRequestedTouched.current = true;
    setPlannerRequestedMusd(value);
  }, []);
  const refreshOpenTroveReads = useCallback(() => {
    refresh();
    refreshPlanner();
  }, [refresh, refreshPlanner]);
  const handleTroveConfirmed = useCallback(() => {
    refresh();
    refreshPlanner();
  }, [refresh, refreshPlanner]);
  const handleExistingTroveDetected = useCallback(() => {
    if (state.address) setOpenTroveConflictAccount(state.address.toLowerCase());
    refresh();
    refreshPlanner();
  }, [state.address, refresh, refreshPlanner]);
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
      body = openTroveConflict ? (
        <div className="space-y-3">
          <DataStatus state="unavailable" detail="Trove reads disagree for this wallet" />
          <p className="text-sm text-rose-200" role="alert">The open-Trove checks found an existing or non-empty Trove for this account, but the summary read says there is none. No open action is available until a fresh read resolves this mismatch. Refresh the Trove read or verify the selected account; no wallet request was made.</p>
          <Button variant="secondary" onClick={refreshOpenTroveReads} className="min-h-11">Refresh Trove read</Button>
        </div>
      ) : !readFresh ? (
        <div className="space-y-3">
          <DataStatus state="unverified" detail="the last read is out of date" />
          <p className="text-sm text-mist-400">The last read found no active Trove, but that may have changed. Refresh before acting.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <DataStatus state="live" detail={`no active Trove · block ${result.blockNumber}`} />
          <p className="text-base font-semibold text-mist-100">No active Trove was found for this wallet.</p>
          <p className="text-sm text-mist-400">The pinned read at block {result.blockNumber.toLocaleString()} found no active Trove for <span className="break-all font-mono text-mist-300">{state.address}</span> on {network.label}. If you expected an existing Trove, confirm this is its owner account or refresh before choosing the open-only action below.</p>
          {result.troveStatus === 4 && result.closedHistory && <ClosedRedemptionHistory history={result.closedHistory} explorerUrl={network.explorerUrl} />}
          <details
            className="rounded-lg border border-line bg-ink-800/40 px-3"
            onToggle={(event) => setPlannerExpanded(event.currentTarget.open)}
          >
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-gold-300">Open a new Trove</summary>
            <div className="space-y-4 pb-4">
              <p className="text-sm text-mist-400">Use the live protocol minimums, then confirm once in your wallet.</p>
              <OpenTrovePlanner
                live={plannerSnapshot}
                loading={plannerView.status === "loading"}
                unavailableReason={plannerUnavailableReason}
                collateralBtc={plannerCollateralBtc}
                requestedMusd={plannerRequestedMusd}
                onCollateralBtcChange={changePlannerCollateral}
                onRequestedMusdChange={changePlannerRequested}
              />
              <OpenTroveAction
                enabled={plannerExpanded}
                collateralBtc={plannerCollateralBtc}
                requestedMusd={plannerRequestedMusd}
                onConfirmed={handleTroveConfirmed}
                onExistingTroveDetected={handleExistingTroveDetected}
                onFreshSnapshot={applyMinimums}
                onRefreshMinimums={refreshPlanner}
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
          <Button variant="ghost" onClick={refreshOpenTroveReads} className="min-h-11 px-2" aria-label="Refresh Trove">
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

function ClosedRedemptionHistory({ history, explorerUrl }: { history: ClosedTroveHistory; explorerUrl: string }) {
  const transactionUrl = history.closure
    ? `${explorerUrl.replace(/\/$/, "")}/tx/${history.closure.transactionHash}`
    : null;
  return (
    <section aria-labelledby="closed-trove-history-title" className="space-y-3 rounded-xl border border-gold-500/30 bg-ink-800/60 p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-300">Closed Trove history</p>
        <h3 id="closed-trove-history-title" className="mt-1 text-base font-semibold text-mist-100">Closed by redemption</h3>
      </div>
      {history.closure ? (
        <div className="space-y-2 text-sm text-mist-300">
          <p>Closed at block <span className="font-semibold text-mist-100">{history.closure.blockNumber.toLocaleString()}</span>.</p>
          <p className="break-all font-mono text-xs text-mist-300">{history.closure.transactionHash}</p>
          {transactionUrl && <a href={transactionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium text-gold-300 hover:underline">Open redemption transaction</a>}
        </div>
      ) : (
        <p className="text-sm text-amber-200">The TroveManager reports closed by redemption, but its exact transaction and block could not be verified in the recent log window. {history.closureUnavailableReason ?? "Refresh the read or verify the network."}</p>
      )}
      {history.claimableSurplusRaw === null ? (
        <p className="text-sm text-mist-400">Claimable BTC collateral surplus: unavailable. {history.surplusUnavailableReason ?? "No verified value is shown."}</p>
      ) : history.claimableSurplusRaw > 0n ? (
        <p className="text-sm text-mist-300">Claimable BTC collateral surplus at block {history.snapshotBlock.toLocaleString()}: <span className="font-semibold text-mist-100">{history.claimableSurplusBtc} BTC</span>.</p>
      ) : (
        <p className="text-sm text-mist-300">No claimable BTC collateral surplus at block {history.snapshotBlock.toLocaleString()}.</p>
      )}
      <p className="text-xs leading-relaxed text-mist-500">Final pre-redemption collateral ratio: unavailable; no current risk ratio is shown for a closed Trove. This history view does not provide a surplus-claim action.</p>
    </section>
  );
}
