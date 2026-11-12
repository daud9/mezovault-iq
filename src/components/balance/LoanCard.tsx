import { useEffect, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { DataStatus } from "../ui/DataStatus";
import { OpenTrovePlanner } from "./OpenTrovePlanner";
import { OpenTroveAction } from "./OpenTroveAction";
import { useWallet } from "../wallet/WalletProvider";
import { useLoan } from "../../hooks/useLoan";
import { useOpenTroveSnapshot } from "../../hooks/useOpenTroveSnapshot";
import { formatTime } from "../../lib/format";
import { isLoanPriceFresh, isLoanReadFresh, loanReadAgeMs } from "../../lib/loan";
import { calculateCollateralRatioBps, formatPercentBps } from "../../lib/troveRisk";

/** Read-only loan view plus the separately wallet-confirmed open-only action. */
export function LoanCard() {
  const { state, network, isSupportedNetwork } = useWallet();
  const { view, refresh } = useLoan();
  const [nowMs, setNowMs] = useState(() => Date.now());
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
  const plannerEnabled = loan !== null && readFresh && !loan.hasLoan;
  const { view: plannerView, refresh: refreshPlanner } = useOpenTroveSnapshot(plannerEnabled);
  const [plannerCollateralBtc, setPlannerCollateralBtc] = useState("");
  const [plannerRequestedMusd, setPlannerRequestedMusd] = useState("");

  const plannerSnapshot = plannerView.status === "done" && plannerView.result.status === "ok"
    ? plannerView.result.snapshot
    : null;
  const plannerUnavailableReason = plannerView.status === "idle"
    ? "Live protocol reads have not started. Refresh to try again."
    : plannerView.status === "done" && plannerView.result.status !== "ok"
      ? plannerView.result.status === "error"
        ? plannerView.result.message
        : plannerView.result.status === "not-configured"
          ? plannerView.result.reason
          : "The RPC reports a different network. No planner values are shown."
      : undefined;

  let body: ReactNode;
  if (state.status !== "connected") {
    body = <p className="text-sm text-mist-400">Connect a wallet to read its MUSD loan.</p>;
  } else if (!isSupportedNetwork) {
    body = <p className="text-sm text-mist-400">Switch to {network.label} to read the loan.</p>;
  } else if (view.status === "idle" || view.status === "loading") {
    body = <p className="text-sm text-mist-400" role="status">Reading loan from {network.label}…</p>;
  } else if (view.status === "wrong-network") {
    body = <DataStatus state="unverified" detail={`wallet chain ${view.actualChainId ?? "unknown"}; expected ${view.expectedChainId}`} />;
  } else {
    const r = view.result;
    if (r.status === "ok" && !r.hasLoan) {
      body = !readFresh ? (
        <div className="space-y-3">
          <DataStatus state="unverified" detail="the no-loan read is stale" />
          <p className="text-sm text-mist-400">The last pinned-block read at block {r.blockNumber} found no active Trove, but it is not current. Refresh and verify the wallet's status before the open-Trove planner is made available.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <DataStatus state="live" detail={`no active Trove · block ${r.blockNumber}`} />
          <p className="text-sm font-semibold text-mist-100">No active Trove</p>
          <p className="text-sm text-mist-400">
            No active Trove was read for this wallet on {network.label}. The planner below estimates a new position from
            fresh protocol data. A separate open-only action rechecks and simulates the exact transaction before your wallet is opened.
          </p>
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
      );
    } else if (r.status === "ok") {
      const readAgeMs = loanReadAgeMs(r, nowMs);
      body = (
        <div className="space-y-4">
          {!readFresh ? (
            <DataStatus state="unverified" detail={`position read stale${readAgeMs === null ? "" : ` · ${Math.floor(readAgeMs / 1_000)}s old`}`} />
          ) : priceFresh ? (
            <DataStatus state="live" detail={`position and price inputs · block ${r.blockNumber}`} />
          ) : (
            <DataStatus state="unverified" detail="position current; BTC/USD oracle stale or unavailable" />
          )}
          <div className="grid grid-cols-2 gap-4">
            <div><p className="text-xs text-mist-500">Collateral (BTC)</p><p className="text-lg font-semibold text-mist-100">{r.collateralBtc}</p></div>
            <div><p className="text-xs text-mist-500">Debt (MUSD)</p><p className="text-lg font-semibold text-mist-100">{r.debtMusd}</p></div>
            <div>
              <p className="text-xs text-mist-500">Collateral ratio (informational health indicator)</p>
              <p className="text-lg font-semibold text-mist-100">{!readFresh || !priceFresh || ratioBps === null ? "Unavailable" : formatPercentBps(ratioBps)}</p>
            </div>
            <div>
              <p className="text-xs text-mist-500">Collateral value (USD)</p>
              <p className="text-lg font-semibold text-mist-100">{!readFresh || !priceFresh || r.collateralValueUsd === null ? "Unavailable" : `$${r.collateralValueUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</p>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-mist-500">
            Ratio = collateral value ÷ debt, using the fresh BTC/USD price from Mezo PriceFeed. It is not a safe/at-risk verdict; use Trove Risk Lab for a fresh live MCR comparison.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {r.priceUpdatedAt && r.priceAgeSeconds !== null ? (
              <DataStatus state={priceFresh ? "live" : "unverified"} detail={`${priceFresh ? "oracle updated" : "stale oracle update"} ${formatTime(r.priceUpdatedAt)}`} />
            ) : (
              <DataStatus state="unavailable" detail={r.riskInputsError ?? "no verified price"} />
            )}
            <span className="text-xs text-mist-500">Block {r.blockNumber} · retrieved {formatTime(r.retrievedAt)}</span>
          </div>
          <section className="space-y-3 border-t border-line pt-4" aria-labelledby="trove-management-title">
            <div>
              <h3 id="trove-management-title" className="text-sm font-semibold text-mist-100">Manage this trove</h3>
              <p className="mt-1 text-xs leading-relaxed text-mist-400">
                No operation-specific management transaction is approved in this code. Nothing is prepared or sent. Each
                needs a separately reviewed contract call, verified preflight and simulation, and owner approval before it can be enabled.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {["Add collateral", "Withdraw collateral", "Repay MUSD", "Borrow more", "Close trove"].map((operation) => (
                <button
                  key={operation}
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="flex min-h-11 cursor-not-allowed items-center justify-between gap-2 rounded-lg border border-line bg-ink-800/50 px-3 text-left text-sm text-mist-400 opacity-70"
                >
                  <span>{operation}</span>
                  <span className="text-xs text-mist-500">Coming soon</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      );
    } else if (r.status === "not-configured") {
      body = <DataStatus state="not-configured" detail={r.reason} />;
    } else if (r.status === "wrong-network") {
      body = <p className="text-sm text-mist-400">The RPC reports a different network. No loan is shown.</p>;
    } else {
      body = (
        <div className="space-y-3">
          <DataStatus state="unavailable" />
          <p className="text-sm text-mist-400">{r.message} No substitute value is shown.</p>
        </div>
      );
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Your Trove</p>
          <p className="mt-1 text-sm text-mist-400">BTC collateral and MUSD debt on {network.label}</p>
        </div>
        {state.status === "connected" && isSupportedNetwork && (
          <Button variant="ghost" onClick={() => { refresh(); refreshPlanner(); }} className="min-h-11 px-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </Button>
        )}
      </div>
      {body}
      <p className="border-t border-line pt-4 text-xs leading-relaxed text-mist-500">
        Only opening a new Trove is enabled, on Mezo Testnet (chain 31611), after fresh same-block preflight and your own wallet approval.
        Adding collateral, withdrawing, repaying, borrowing more, closing and liquidating are not available in this app.
      </p>
    </Card>
  );
}
