import type { ReactNode } from "react";
import { usePoolBtcBalance } from "../../hooks/usePoolBtcBalance";
import { formatTime, shortAddress } from "../../lib/format";
import { Card } from "../ui/Card";
import { DataStatus } from "../ui/DataStatus";
import { useWallet } from "../wallet/WalletProvider";

export function PoolBtcBalanceCard() {
  const { state, network } = useWallet();
  const { view } = usePoolBtcBalance();
  const testnetConfigured = network.key === "testnet" && network.chainId === 31_611;

  let body: ReactNode;
  if (!testnetConfigured) {
    body = <p className="text-sm text-mist-400">Configured on Mezo Testnet only.</p>;
  } else if (state.status !== "connected") {
    body = <p className="text-sm text-mist-400">Connect a wallet to read this token balance.</p>;
  } else if (state.chainId !== 31_611) {
    body = <p className="text-sm text-mist-400">Switch to Mezo Testnet to read this balance.</p>;
  } else if (view.status === "idle" || view.status === "loading") {
    body = <p className="text-sm text-mist-400" role="status">Reading Pool BTC…</p>;
  } else if (view.result.status === "ok") {
    const result = view.result;
    body = (
      <div className="space-y-2">
        <p className="text-2xl font-semibold text-mist-100">
          {result.formatted} <span className="text-base font-medium text-gold-300">Pool BTC</span>
        </p>
        <p className="text-xs text-mist-500">{shortAddress(result.tokenAddress)} · block {result.blockNumber} · {formatTime(result.retrievedAt)}</p>
      </div>
    );
  } else {
    const detail = view.result.status === "error"
      ? view.result.message
      : view.result.status === "no-contract"
        ? "No token contract was found; no balance is shown."
        : view.result.status === "wrong-network"
          ? "The RPC reports a different network; no balance is shown."
          : view.result.reason;
    body = (
      <div className="space-y-2">
        <DataStatus state={view.result.status === "not-configured" ? "not-configured" : "unavailable"} />
        <p className="text-sm text-mist-400">{detail}{view.result.status === "error" ? " Automatic reads will retry." : ""}</p>
      </div>
    );
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Pool BTC · ERC-20</p>
          <p className="mt-1 text-sm text-mist-400">Mezo Testnet token balance</p>
        </div>
      </div>
      {body}
      <p className="text-xs leading-relaxed text-mist-500">Configured token identity is unverified. No USD value is included.</p>
    </Card>
  );
}
