import { useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { DataStatus } from "../ui/DataStatus";
import { OpenTrovePlanner } from "./OpenTrovePlanner";
import { OpenTroveTestAction } from "./OpenTroveTestAction";
import { useWallet } from "../wallet/WalletProvider";
import { useLoan } from "../../hooks/useLoan";
import { useOpenTroveSnapshot } from "../../hooks/useOpenTroveSnapshot";
import { formatTime } from "../../lib/format";

const STALE_AFTER_SECONDS = 3600;

/** Read-only loan view plus one fixed owner-approved test action; no general loan controls are exposed. */
export function LoanCard() {
  const { state, network, isSupportedNetwork } = useWallet();
  const { view, refresh } = useLoan();
  const plannerEnabled = view.status === "done" && view.result.status === "ok" && !view.result.hasLoan;
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
  } else {
    const r = view.result;
    if (r.status === "ok" && !r.hasLoan) {
      body = (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-mist-100">No active Trove</p>
          <p className="text-sm text-mist-400">
            No active trove was read for this wallet on {network.label}. The planner below is preview-only; the separate
            wallet action is limited to the exact owner-approved test, and is not a general borrowing flow.
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
          <OpenTroveTestAction />
        </div>
      );
    } else if (r.status === "ok") {
      const stale = r.priceAgeSeconds !== null && r.priceAgeSeconds > STALE_AFTER_SECONDS;
      body = (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><p className="text-xs text-mist-500">Collateral (BTC)</p><p className="text-lg font-semibold text-mist-100">{r.collateralBtc}</p></div>
            <div><p className="text-xs text-mist-500">Debt (MUSD)</p><p className="text-lg font-semibold text-mist-100">{r.debtMusd}</p></div>
            <div>
              <p className="text-xs text-mist-500">Collateral ratio (informational health indicator)</p>
              <p className="text-lg font-semibold text-mist-100">{r.collateralRatioPct === null ? "Unavailable" : `${r.collateralRatioPct.toFixed(0)}%`}</p>
            </div>
            <div>
              <p className="text-xs text-mist-500">Collateral value (USD)</p>
              <p className="text-lg font-semibold text-mist-100">{r.collateralValueUsd === null ? "Unavailable" : `$${r.collateralValueUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</p>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-mist-500">
            Ratio = collateral value ÷ debt, using the BTC/USD price from Mezo PriceFeed. It is not a safe/at-risk verdict:
            the protocol liquidation threshold is not verified here.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {r.priceUpdatedAt ? (
              <DataStatus state={stale ? "unverified" : "live"} detail={stale ? "price is stale" : `price updated ${formatTime(r.priceUpdatedAt)}`} />
            ) : (
              <DataStatus state="unavailable" detail="no price" />
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
        Generic borrow and Trove-management transactions are not available in this app. The no-active-trove test action,
        when eligible, is limited to its disclosed fixed wallet, amounts and Mezo Testnet transaction.
      </p>
    </Card>
  );
}
