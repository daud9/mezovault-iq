import type { ReactNode } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { DataStatus } from "../ui/DataStatus";
import { useWallet } from "../wallet/WalletProvider";
import { useLoan } from "../../hooks/useLoan";
import { formatTime } from "../../lib/format";

const BORROW_URL = "https://mezo.org/feature/borrow";
const STALE_AFTER_SECONDS = 3600;

/** Read-only view of the connected wallet's MUSD loan. All changes happen in the official interface. */
export function LoanCard() {
  const { state, network, isSupportedNetwork } = useWallet();
  const { view, refresh } = useLoan();

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
          <p className="text-sm font-semibold text-mist-100">No active MUSD loan</p>
          <p className="text-sm text-mist-400">
            This wallet has no collateral or debt on {network.label}. Loans are opened in the official Mezo borrow interface.
          </p>
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
              <p className="text-xs text-mist-500">Collateral ratio</p>
              <p className="text-lg font-semibold text-mist-100">{r.collateralRatioPct === null ? "Unavailable" : `${r.collateralRatioPct.toFixed(0)}%`}</p>
            </div>
            <div>
              <p className="text-xs text-mist-500">Collateral value (USD)</p>
              <p className="text-lg font-semibold text-mist-100">{r.collateralValueUsd === null ? "Unavailable" : `$${r.collateralValueUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}</p>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-mist-500">
            Ratio = collateral value ÷ debt, using the BTC/USD price from the official Mezo oracle. It is not the protocol's liquidation threshold, which is not verified here.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {r.priceUpdatedAt ? (
              <DataStatus state={stale ? "unverified" : "live"} detail={stale ? "price is stale" : `price updated ${formatTime(r.priceUpdatedAt)}`} />
            ) : (
              <DataStatus state="unavailable" detail="no price" />
            )}
            <span className="text-xs text-mist-500">Block {r.blockNumber} · retrieved {formatTime(r.retrievedAt)}</span>
          </div>
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
          <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Your MUSD loan</p>
          <p className="mt-1 text-sm text-mist-400">BTC collateral and MUSD debt on {network.label}</p>
        </div>
        {state.status === "connected" && isSupportedNetwork && (
          <Button variant="ghost" onClick={refresh} className="min-h-11 px-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </Button>
        )}
      </div>
      {body}
      <a href={BORROW_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 border-t border-line pt-4 text-sm font-medium text-gold-300 hover:underline">
        Open the official borrow page (testnet guide applies) <ExternalLink className="h-4 w-4" aria-hidden="true" />
      </a>
    </Card>
  );
}
