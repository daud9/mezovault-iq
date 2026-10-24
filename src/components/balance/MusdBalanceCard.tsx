import { RefreshCw } from "lucide-react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { DataStatus } from "../ui/DataStatus";
import { useWallet } from "../wallet/WalletProvider";
import { useMusdBalance } from "../../hooks/useMusdBalance";
import { formatTime, shortAddress } from "../../lib/format";
import { FaucetPanel } from "./FaucetPanel";

/**
 * Live MUSD balance for the connected wallet. Shows the result of the actual request,
 * including failures. It never displays demonstration figures.
 */
export function MusdBalanceCard() {
  const { state, network, isSupportedNetwork, connect, switchNetwork } = useWallet();
  const { view, refresh } = useMusdBalance();

  return (
    <Card highlight className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-gold-400">Wallet MUSD balance</p>
          <p className="mt-1 text-sm text-mist-400">
            {network.label} · token {network.musd ? shortAddress(network.musd.address) : "not configured"}
          </p>
        </div>
        {state.status === "connected" && isSupportedNetwork && view.status === "done" && view.result.status === "ok" && (
          <DataStatus state="live" detail={`block ${view.result.blockNumber}`} />
        )}
      </div>

      <Body
        state={state.status}
        walletFound={state.walletFound}
        error={state.error}
        onConnect={connect}
        onSwitch={switchNetwork}
        networkLabel={network.label}
        supported={isSupportedNetwork}
        chainId={state.chainId}
        view={view}
        onRetry={refresh}
      />

      <FaucetPanel />
    </Card>
  );
}

function Body(props: {
  state: string;
  walletFound: boolean | null;
  error: string | null;
  onConnect: () => Promise<void>;
  onSwitch: () => Promise<void>;
  networkLabel: string;
  supported: boolean;
  chainId: number | null;
  view: ReturnType<typeof useMusdBalance>["view"];
  onRetry: () => void;
}) {
  const { state, walletFound, error, onConnect, onSwitch, networkLabel, supported, chainId, view, onRetry } = props;

  if (walletFound === false && state !== "connected") {
    return (
      <Message title="No wallet detected" body="Install a browser wallet that supports EVM networks, then reload this page to read your MUSD balance." status="unavailable" />
    );
  }

  if (state === "disconnected") {
    return (
      <div className="space-y-4">
        <Message title="Connect a wallet to read your balance" body="Read-only. The app asks only for your account address and never requests keys or seed phrases." status="not-configured" />
        <Button onClick={onConnect}>Connect wallet</Button>
      </div>
    );
  }

  if (state === "connecting") {
    return <p className="text-sm text-mist-400" role="status">Waiting for your wallet…</p>;
  }

  if (state === "error") {
    return (
      <div className="space-y-4">
        <Message title="Wallet connection failed" body={error ?? "Try again."} status="unavailable" />
        <Button onClick={onConnect} variant="secondary">Try again</Button>
      </div>
    );
  }

  if (!supported) {
    return (
      <div className="space-y-4">
        <Message
          title="Wrong network"
          body={`Your wallet is on ${chainId ? `chain ${chainId}` : "an unknown network"}. Switch to ${networkLabel} to read MUSD. No balance is shown for this network.`}
          status="unavailable"
        />
        <Button onClick={onSwitch}>Switch to {networkLabel}</Button>
        {error && <p className="text-xs text-risk-high">{error}</p>}
      </div>
    );
  }

  if (view.status === "idle" || view.status === "loading") {
    return <p className="text-sm text-mist-400" role="status">Reading MUSD from {networkLabel}…</p>;
  }

  const r = view.result;

  switch (r.status) {
    case "ok":
      return (
        <div className="space-y-4">
          <div>
            <p className="text-3xl font-semibold tracking-tight text-mist-100">
              {r.formatted} <span className="text-lg font-medium text-gold-300">{r.symbol}</span>
            </p>
            <p className="mt-2 break-all text-xs text-mist-500">Exact: {r.exact} {r.symbol} · {r.decimals} decimals</p>
            <p className="mt-1 text-xs text-mist-500">Retrieved {formatTime(r.retrievedAt)} from {networkLabel}.</p>
            {r.formatted === "0" && <p className="mt-2 text-sm text-mist-400">This wallet holds no MUSD on {networkLabel}.</p>}
          </div>
          <Button variant="ghost" onClick={onRetry} className="px-0">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </Button>
        </div>
      );
    case "not-configured":
      return <Message title="Not configured" body={r.reason} status="not-configured" />;
    case "no-contract":
      return <Message title="No token contract found" body={`Nothing is deployed at ${r.tokenAddress} on this RPC endpoint. No balance is shown.`} status="unavailable" />;
    case "wrong-network":
      return <Message title="Network check failed" body="The RPC endpoint reports a different chain than the one configured. No balance is shown." status="unavailable" />;
    case "error":
      return (
        <div className="space-y-4">
          <Message title="MUSD balance unavailable" body={`${r.message} No demonstration balance is shown in its place.`} status="unavailable" />
          <Button variant="secondary" onClick={onRetry}>Retry</Button>
        </div>
      );
  }
}

function Message({ title, body, status }: { title: string; body: string; status: "unavailable" | "not-configured" }) {
  return (
    <div className="space-y-2">
      <DataStatus state={status} />
      <p className="text-sm font-semibold text-mist-100">{title}</p>
      <p className="text-sm leading-relaxed text-mist-400">{body}</p>
    </div>
  );
}
