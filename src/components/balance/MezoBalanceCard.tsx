import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { DataStatus } from "../ui/DataStatus";
import { useWallet } from "../wallet/WalletProvider";
import { useMezoBalance } from "../../hooks/useMezoBalance";
import { formatTime, shortAddress } from "../../lib/format";

/** MEZO token balance, read from the contract after its code, symbol and decimals are checked on-chain. */
export function MezoBalanceCard() {
  const { state, network, isSupportedNetwork } = useWallet();
  const { view, refresh } = useMezoBalance();

  let body: ReactNode;
  if (state.status !== "connected") {
    body = <p className="text-sm text-mist-400">Connect a wallet to read its MEZO balance.</p>;
  } else if (!isSupportedNetwork) {
    body = <p className="text-sm text-mist-400">Switch to {network.label} to read the MEZO balance.</p>;
  } else if (view.status === "idle" || view.status === "loading") {
    body = <p className="text-sm text-mist-400" role="status">Reading MEZO from {network.label}…</p>;
  } else {
    const r = view.result;
    switch (r.status) {
      case "ok":
        body = (
          <div className="space-y-2">
            <p className="text-2xl font-semibold text-mist-100">
              {r.formatted} <span className="text-base font-medium text-gold-300">{r.symbol}</span>
            </p>
            <p className="text-xs text-mist-500">Exact: {r.exact} {r.symbol} · {r.decimals} decimals (read from the contract)</p>
            <p className="text-xs text-mist-500">Token {shortAddress(r.tokenAddress)} · block {r.blockNumber} · retrieved {formatTime(r.retrievedAt)}</p>
            {r.formatted === "0" && <p className="text-sm text-mist-400">This wallet holds no MEZO on {network.label}.</p>}
          </div>
        );
        break;
      case "no-contract":
        body = (
          <div className="space-y-2">
            <DataStatus state="unavailable" detail="no contract on this network" />
            <p className="text-sm text-mist-400">
              No token contract was found at {shortAddress(r.tokenAddress)} on {network.label}. No balance is shown.
            </p>
          </div>
        );
        break;
      case "not-configured":
        body = <DataStatus state="not-configured" detail={r.reason} />;
        break;
      case "wrong-network":
        body = <p className="text-sm text-mist-400">The RPC reports a different network. No balance is shown.</p>;
        break;
      case "error":
        body = (
          <div className="space-y-3">
            <DataStatus state="unavailable" />
            <p className="text-sm text-mist-400">{r.message} No substitute value is shown.</p>
          </div>
        );
        break;
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Wallet MEZO</p>
          <p className="mt-1 text-sm text-mist-400">Token balance on {network.label}</p>
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
