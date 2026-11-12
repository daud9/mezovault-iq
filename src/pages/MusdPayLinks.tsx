import { useEffect, useState } from "react";
import { Copy, ExternalLink, Link2, Share2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { DataStatus } from "../components/ui/DataStatus";
import { SectionHeader } from "../components/ui/SectionHeader";
import { useWallet } from "../components/wallet/WalletProvider";
import { MEZO_NETWORKS, OFFICIAL_SOURCES } from "../config/chains";
import { buildLinkAuthorizationMessage, normalizeMUSDLinkAmount, normalizeMUSDRecipient, X402_TESTNET_NETWORK } from "../lib/x402PayLinks";

type ServerState = "checking" | "ready" | "unconfigured" | "unavailable";
interface CreatedLink {
  url: string;
  recipient: string;
  amount: string;
  expiresAt: number;
}

export function MusdPayLinks() {
  const { network, state, connect, switchToTestnet, signMessage } = useWallet();
  const walletOnTestnet = state.status === "connected" && state.chainId === MEZO_NETWORKS.testnet.chainId;
  const [serverState, setServerState] = useState<ServerState>("checking");
  const [amountInput, setAmountInput] = useState("");
  const [created, setCreated] = useState<CreatedLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/pay-links/status", { cache: "no-store", headers: { Accept: "application/json" } });
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
          throw new Error("The dynamic merchant endpoint is not responding.");
        }
        const body = await response.json() as { enabled?: unknown };
        if (active) setServerState(body.enabled === true ? "ready" : "unconfigured");
      } catch {
        if (active) setServerState("unavailable");
      }
    })();
    return () => { active = false; };
  }, []);

  async function createLink() {
    setError(null);
    setCreated(null);
    setCopied(false);
    if (serverState !== "ready") {
      setError("The dynamic x402 endpoint or its server secret is not configured. No link was created.");
      return;
    }
    if (state.status !== "connected" || !state.address) {
      setError("Connect the wallet that will receive this payment.");
      return;
    }
    if (!walletOnTestnet) {
      setError("Switch the connected wallet to Mezo Testnet before creating a link.");
      return;
    }
    const recipient = normalizeMUSDRecipient(state.address);
    if (!recipient) {
      setError("The connected wallet returned an invalid recipient address.");
      return;
    }
    const amount = normalizeMUSDLinkAmount(amountInput);
    if (amount.error || amount.amount === null) {
      setError(amount.error ?? "Enter a valid MUSD amount.");
      return;
    }

    setWorking(true);
    try {
      const issuedAt = Date.now();
      const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
      const nonce = Array.from(nonceBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      const message = buildLinkAuthorizationMessage({ recipient, amount: amount.amount, issuedAt, nonce });
      const signature = await signMessage(message, { account: recipient, chainId: MEZO_NETWORKS.testnet.chainId });
      const response = await fetch("/api/pay-links", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ recipient, amount: amount.amount, issuedAt, nonce, signature }),
      });
      const result = await response.json().catch(() => null) as { path?: unknown; amount?: unknown; recipient?: unknown; expiresAt?: unknown; message?: unknown } | null;
      if (!response.ok) {
        throw new Error(typeof result?.message === "string" ? result.message : "The server could not create a payment link.");
      }
      if (typeof result?.path !== "string" || !/^\/pay#link=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(result.path) ||
          typeof result.amount !== "string" || typeof result.recipient !== "string" || typeof result.expiresAt !== "number") {
        throw new Error("The server returned an invalid link response. No link was shown.");
      }
      setCreated({ url: new URL(result.path, window.location.origin).href, amount: result.amount, recipient: result.recipient, expiresAt: result.expiresAt });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The wallet or server could not complete link creation.");
    } finally {
      setWorking(false);
    }
  }

  async function copyLink() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.url);
      setCopied(true);
      setError(null);
    } catch {
      setError("Copy is unavailable in this browser. Select the link and copy it manually.");
    }
  }

  async function shareLink() {
    if (!created || typeof navigator.share !== "function") return;
    try {
      await navigator.share({ title: `Pay ${created.amount} MUSD`, url: created.url });
    } catch {
      // The share sheet was dismissed; the existing link remains available.
    }
  }

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="MUSD · x402"
        title="Gasless MUSD Pay Links"
        description="Create a recipient-bound MUSD payment URL for Mezo Testnet. Buyers sign x402 authorization in their own wallet; the official facilitator verifies and settles it, paying BTC gas."
      />

      <Card className="space-y-5">
        <div className="flex items-start gap-3">
          <span className="rounded-xl border border-gold-500/30 bg-gold-500/10 p-2 text-gold-300"><Link2 className="h-5 w-5" aria-hidden="true" /></span>
          <div className="space-y-2">
            <DataStatus
              state={serverState === "ready" ? "unverified" : serverState === "unavailable" ? "unavailable" : "not-configured"}
              detail={serverState === "ready" ? "dynamic endpoint ready · Testnet only" : serverState === "checking" ? "checking merchant endpoint" : serverState === "unconfigured" ? "server secret missing" : "dynamic endpoint unreachable"}
            />
            <h2 className="text-sm font-semibold text-mist-100">Create a buyer-gasless MUSD link</h2>
            <p className="text-sm leading-relaxed text-mist-400">The link pays the wallet connected below. The amount is fixed in the signed server challenge, and links expire after 30 days. Each link is reusable, so a buyer can pay it more than once. Supported range: 0.001–1,000 MUSD.</p>
          </div>
        </div>
        {state.status !== "connected" ? (
          <Button onClick={() => { void connect(); }} disabled={working} className="min-h-11 w-full sm:w-auto">Connect recipient wallet</Button>
        ) : !walletOnTestnet ? (
          <Button onClick={() => { void switchToTestnet(); }} disabled={working} className="min-h-11 w-full sm:w-auto">Switch wallet to Mezo Testnet</Button>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="x402-recipient" className="text-sm font-medium text-mist-100">Recipient wallet</label>
              <input id="x402-recipient" readOnly value={state.address ?? ""} className="w-full rounded-xl border border-line bg-ink-900 px-3 py-2.5 font-mono text-xs text-mist-200" />
              <p className="text-xs text-mist-500">Bound to the connected Testnet wallet; the wallet signs to prove control.</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="x402-amount" className="text-sm font-medium text-mist-100">Amount (MUSD)</label>
              <input id="x402-amount" inputMode="decimal" autoComplete="off" value={amountInput} onChange={(event) => { setAmountInput(event.currentTarget.value); setCreated(null); setError(null); }} placeholder="0.001" className="w-full rounded-xl border border-line bg-ink-800 px-3 py-2.5 text-sm text-mist-100 outline-none focus:border-gold-500/60" />
            </div>
            <p className="text-xs leading-relaxed text-mist-500">The next wallet prompt is an off-chain message proving you control the recipient. It is not an on-chain transfer and does not move MUSD or BTC.</p>
            {error && <p className="rounded-xl border border-risk-high/30 bg-risk-high/5 p-3 text-sm text-risk-high" role="alert">{error}</p>}
            <Button onClick={() => { void createLink(); }} disabled={working || serverState !== "ready" || !walletOnTestnet} className="min-h-11 w-full sm:w-auto">
              <Link2 className="h-4 w-4" aria-hidden="true" />{working ? "Signing and creating…" : "Create gasless MUSD link"}
            </Button>
          </div>
        )}

        {error && state.status !== "connected" && <p className="rounded-xl border border-risk-high/30 bg-risk-high/5 p-3 text-sm text-risk-high" role="alert">{error}</p>}

        {created && (
          <div className="space-y-3 rounded-xl border border-line bg-ink-800/60 p-4" role="status">
            <p className="text-xs font-medium uppercase tracking-wider text-gold-400">x402 payment link · {created.amount} MUSD</p>
            <p className="break-all font-mono text-xs text-mist-300">To {created.recipient} · {X402_TESTNET_NETWORK}</p>
            <label htmlFor="created-x402-link" className="text-xs text-mist-500">Share this checkout URL</label>
            <input id="created-x402-link" readOnly value={created.url} onFocus={(event) => event.currentTarget.select()} className="w-full rounded-xl border border-line bg-ink-900 px-3 py-2.5 font-mono text-xs text-mist-200" />
            <p className="text-xs text-mist-500">Expires {new Date(created.expiresAt).toLocaleString()}.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Button variant="secondary" onClick={() => { void copyLink(); }} className="min-h-11"><Copy className="h-4 w-4" aria-hidden="true" />{copied ? "Copied" : "Copy link"}</Button>
              {typeof navigator.share === "function" && <Button variant="secondary" onClick={() => { void shareLink(); }} className="min-h-11"><Share2 className="h-4 w-4" aria-hidden="true" />Share</Button>}
            </div>
          </div>
        )}
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-mist-100">What Mezo x402 does support</h2>
          <p className="text-sm leading-relaxed text-mist-400">On Mezo Testnet, a buyer signs an off-chain EIP-712 MUSD authorization in their wallet. The facilitator at <span className="font-mono text-mist-300">facilitator.vativ.io</span> verifies and settles the payment, paying native BTC gas. The buyer needs MUSD and a compatible signing wallet, but does not pay BTC gas for that x402 settlement.</p>
          <p className="text-xs leading-relaxed text-mist-500">This is not a general gasless ERC-20 transfer, not an ERC-4337 paymaster, and not a claim that acquiring MUSD itself is gas-free. The documented browser flow is a payment for a server-backed resource.</p>
          <a href={OFFICIAL_SOURCES.x402Payments} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-gold-300 hover:underline">Official Mezo x402 overview <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-mist-100">What remains available</h2>
          <p className="text-sm leading-relaxed text-mist-400">The standard Send page still supports wallet-confirmed transfers. Direct MUSD transfers are ordinary on-chain transactions and require native BTC for network fees; the fee and recipient are shown before the wallet prompt.</p>
          <Link to="/app/send" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">Open standard Send</Link>
        </Card>
      </div>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-mist-100">Implementation reference</h2>
        <p className="text-sm leading-relaxed text-mist-400">This merchant uses Mezo’s supported x402 `exact` EVM scheme and the framework-neutral x402 HTTP resource server. Checkout returns HTTP 402 requirements bound to the signed recipient and amount; the browser creates a wallet-signed payment authorization, and access is returned only after facilitator verification and settlement. Failed settlement never produces a paid response.</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <a href="https://mezo.org/docs/developers/getting-started/musd-payments-x402/x402-quickstart/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-gold-300 hover:underline">Official x402 quickstart <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
          <a href="https://docs.x402.org/core-concepts/client-server" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-gold-300 hover:underline">x402 client/server roles <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
        </div>
        <p className="text-xs text-mist-500">Current app network: {network.label} · x402 is pinned to {X402_TESTNET_NETWORK}. The browser receives only a link token; seller signature and buyer payment data are not stored by this app.</p>
      </Card>
    </div>
  );
}
