import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { DataStatus } from "../ui/DataStatus";
import { useWallet } from "../wallet/WalletProvider";
import { useNativeBalance } from "../../hooks/useNativeBalance";
import { formatTime } from "../../lib/format";

/** Native BTC gas balance for the connected wallet, read from the RPC. */
export function BtcBalanceCard() {
  const { state, network, isSupportedNetwork } = useWallet();
  const { view, refresh } = useNativeBalance();

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
        <p className="text-xs text-mist-500">Source: {network.label} RPC (eth_getBalance). Gas token, not priced.</p>
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

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Wallet BTC (gas)</p>
          <p className="mt-1 text-sm text-mist-400">Native balance on {network.label}</p>
        </div>
        {state.status === "connected" && isSupportedNetwork && (
          <Button variant="ghost" onClick={refresh} className="min-h-11 px-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </Button>
        )}
      </div>
      {body}
    </Card>
  );
}
