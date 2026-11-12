import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ExternalLink, LoaderCircle, ShieldCheck, Wallet } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useWallet } from "../components/wallet/WalletProvider";
import { MEZO_NETWORKS } from "../config/chains";
import {
  createMezoTestnetX402HttpClient,
  decodeMUSDRequirementsHeader,
  validateMUSDRequirements,
  validateMUSDSettlementReceipt,
  type CheckedMUSDRequirements,
} from "../lib/x402Buyer";
import { X402_TESTNET_NETWORK } from "../lib/x402PayLinks";

const RESOURCE_PATH = "/api/x402/pay";
const LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

interface CheckoutReceipt {
  transaction: string;
  payer: string;
}

function friendlyError(error: unknown): string {
  if (!(error instanceof Error)) return "Checkout could not be completed. Check your wallet activity before retrying.";
  const text = error.message;
  if (/user rejected|user denied|rejected the request/i.test(text)) return "The wallet request was cancelled. No checkout confirmation was received.";
  if (/chain|network/i.test(text)) return "The wallet changed network during checkout. Switch back to Mezo Testnet and retry only after checking wallet activity.";
  return text.length > 260 ? "Checkout could not be completed. Check your wallet activity before retrying." : text;
}

export function X402Checkout() {
  const location = useLocation();
  const { state: wallet, connect, switchToTestnet, createX402Signer } = useWallet();
  const [details, setDetails] = useState<CheckedMUSDRequirements | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [receipt, setReceipt] = useState<CheckoutReceipt | null>(null);

  const token = useMemo(() => {
    const fragment = new URLSearchParams(location.hash.replace(/^#/, ""));
    const values = fragment.getAll("link");
    if (values.length !== 1) return null;
    const value = values[0];
    return value.length <= 2048 && LINK_TOKEN_PATTERN.test(value) ? value : null;
  }, [location.hash]);
  const resourceUrl = useMemo(() => new URL(RESOURCE_PATH, window.location.origin).href, []);
  const connected = wallet.status === "connected" && Boolean(wallet.address);
  const onTestnet = connected && wallet.chainId === MEZO_NETWORKS.testnet.chainId;

  useEffect(() => {
    let active = true;
    setDetails(null);
    setLoadError(null);
    setPaymentError(null);
    setReceipt(null);
    setLoading(true);

    if (!token) {
      setLoadError("This checkout link is missing or invalid. Ask the sender for a fresh link.");
      setLoading(false);
      return () => { active = false; };
    }

    void (async () => {
      try {
        const response = await fetch(resourceUrl, {
          method: "POST",
          cache: "no-store",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ link: token }),
        });
        if (response.status !== 402) {
          const body = await response.json().catch(() => null) as { message?: unknown; error?: unknown } | null;
          const message = typeof body?.message === "string" ? body.message :
            typeof body?.error === "string" ? body.error.replaceAll("_", " ") :
              response.status === 404 ? "This payment link is invalid or has expired." :
                "The merchant checkout is unavailable. Try again later.";
          throw new Error(message);
        }
        const header = response.headers.get("payment-required");
        if (!header) throw new Error("The merchant did not return an x402 payment requirement. No wallet authorization was requested.");
        const required = decodeMUSDRequirementsHeader(header);
        const checked = validateMUSDRequirements(required, resourceUrl);
        if (active) setDetails(checked);
      } catch (error) {
        if (active) setLoadError(friendlyError(error));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [resourceUrl, token]);

  async function pay() {
    if (!details || !wallet.address || wallet.status !== "connected" || wallet.chainId !== MEZO_NETWORKS.testnet.chainId) return;
    setWorking(true);
    setPaymentError(null);
    setReceipt(null);
    try {
      const signer = await createX402Signer({ account: wallet.address, chainId: MEZO_NETWORKS.testnet.chainId });
      const httpClient = createMezoTestnetX402HttpClient(signer);
      const payload = await httpClient.createPaymentPayload(details.required);
      const paymentHeaders = httpClient.encodePaymentSignatureHeader(payload);
      const response = await fetch(resourceUrl, {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...paymentHeaders,
        },
        body: JSON.stringify({ link: token }),
      });

      const receiptHeader = response.headers.get("payment-response");
      if (!response.ok) {
        if (receiptHeader) {
          const failureReceipt = httpClient.getPaymentSettleResponse((name) => response.headers.get(name));
          if (failureReceipt && failureReceipt.success === false) {
            throw new Error("The facilitator did not confirm settlement. Check wallet activity before retrying or paying again.");
          }
        }
        const body = await response.json().catch(() => null) as { message?: unknown; error?: unknown } | null;
        const message = typeof body?.message === "string" ? body.message :
          response.status === 502 ? "The facilitator could not verify or settle the payment. Check wallet activity before retrying." :
            "No paid checkout confirmation was returned. Check wallet activity before retrying.";
        throw new Error(message);
      }

      if (!receiptHeader) throw new Error("The server returned no x402 settlement receipt. Check wallet activity before retrying.");
      const settlement = httpClient.getPaymentSettleResponse((name) => response.headers.get(name));
      if (!settlement) throw new Error("The facilitator’s settlement receipt could not be read. Check wallet activity before retrying.");
      validateMUSDSettlementReceipt(settlement, details.atomicAmount);
      if (typeof settlement.payer !== "string" || settlement.payer.toLowerCase() !== wallet.address.toLowerCase()) {
        throw new Error("The facilitator receipt did not match the connected buyer wallet. Check wallet activity before retrying.");
      }
      const body = await response.json().catch(() => null) as { ok?: unknown; network?: unknown } | null;
      if (body?.ok !== true || body.network !== X402_TESTNET_NETWORK) {
        throw new Error("The merchant confirmation did not match the Testnet payment. Check wallet activity before retrying.");
      }
      setReceipt({ transaction: settlement.transaction, payer: settlement.payer });
    } catch (error) {
      setPaymentError(friendlyError(error));
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="min-h-screen bg-ink-950 px-4 py-8 text-mist-100 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-mist-400 hover:text-gold-300">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> MezoVault IQ
        </Link>

        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">x402 · Mezo Testnet</p>
          <h1 className="text-3xl font-semibold tracking-tight text-mist-50">MUSD payment checkout</h1>
          <p className="text-sm leading-relaxed text-mist-400">Review the exact recipient and amount before signing. This page will never submit an on-chain buyer transaction.</p>
        </header>

        {loading ? (
          <div role="status">
            <Card className="flex items-center gap-3 py-8 text-sm text-mist-300">
              <LoaderCircle className="h-5 w-5 animate-spin text-gold-400" aria-hidden="true" /> Preparing the secure checkout…
            </Card>
          </div>
        ) : loadError ? (
          <div role="alert">
            <Card className="space-y-3">
              <h2 className="font-semibold text-risk-high">Checkout unavailable</h2>
              <p className="text-sm leading-relaxed text-mist-300">{loadError}</p>
            </Card>
          </div>
        ) : details ? (
          <>
            <Card className="space-y-5">
              <div className="flex items-start gap-3">
                <span className="rounded-xl border border-gold-500/30 bg-gold-500/10 p-2 text-gold-300"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></span>
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold text-mist-100">Payment details</h2>
                  <p className="text-xs text-mist-500">Bound by the merchant’s server-backed x402 requirement</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-line bg-ink-900/70 p-4">
                  <p className="text-xs uppercase tracking-wider text-mist-500">You will authorize</p>
                  <p className="mt-2 text-2xl font-semibold text-gold-300">{details.amount} MUSD</p>
                </div>
                <div className="rounded-xl border border-line bg-ink-900/70 p-4">
                  <p className="text-xs uppercase tracking-wider text-mist-500">Network</p>
                  <p className="mt-2 text-lg font-semibold text-mist-100">Mezo Testnet</p>
                  <p className="mt-1 font-mono text-xs text-mist-500">{X402_TESTNET_NETWORK}</p>
                </div>
              </div>

              <div className="space-y-2 rounded-xl border border-line bg-ink-900/50 p-4">
                <p className="text-xs uppercase tracking-wider text-mist-500">Recipient</p>
                <p className="break-all font-mono text-sm text-mist-200">{details.recipient}</p>
                <p className="text-xs text-mist-500">MUSD token: {MEZO_NETWORKS.testnet.musd!.address}</p>
              </div>

              <div className="space-y-2 rounded-xl border border-gold-500/20 bg-gold-500/5 p-4 text-sm leading-relaxed text-mist-300">
                <p>The facilitator verifies and settles the signed MUSD authorization and pays the Mezo Testnet BTC gas for this x402 payment. A compatible wallet may show one or more typed-data signature prompts; review each before approving.</p>
                <p className="text-xs text-mist-400">If your wallet asks to send an on-chain transaction or pay BTC gas for this checkout, cancel. This integration does not send buyer transactions. The link can be used more than once; confirm before making another payment.</p>
              </div>

              {wallet.status !== "connected" ? (
                <Button onClick={() => { void connect(); }} disabled={working} className="min-h-11 w-full">
                  <Wallet className="h-4 w-4" aria-hidden="true" /> Connect buyer wallet
                </Button>
              ) : !onTestnet ? (
                <Button variant="secondary" onClick={() => { void switchToTestnet(); }} disabled={working} className="min-h-11 w-full">
                  Switch wallet to Mezo Testnet
                </Button>
              ) : receipt ? (
                <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4" role="status">
                  <div className="flex items-center gap-2 text-emerald-300"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /><h2 className="font-semibold">Payment settled</h2></div>
                  <p className="text-sm text-mist-300">The facilitator confirmed {details.amount} MUSD on Mezo Testnet.</p>
                  <p className="break-all font-mono text-xs text-mist-400">Transaction: {receipt.transaction}</p>
                  <p className="break-all font-mono text-xs text-mist-500">Buyer: {receipt.payer}</p>
                </div>
              ) : (
                <Button onClick={() => { void pay(); }} disabled={working || !details} className="min-h-12 w-full text-base">
                  {working ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Waiting for wallet and settlement…</> : `Pay ${details.amount} MUSD`}
                </Button>
              )}

              {wallet.error && wallet.status !== "connected" && <p className="rounded-xl border border-risk-high/30 bg-risk-high/5 p-3 text-sm text-risk-high" role="alert">{wallet.error}</p>}
              {wallet.error && wallet.status === "connected" && !onTestnet && <p className="rounded-xl border border-risk-high/30 bg-risk-high/5 p-3 text-sm text-risk-high" role="alert">{wallet.error}</p>}
              {paymentError && <p className="rounded-xl border border-risk-high/30 bg-risk-high/5 p-3 text-sm leading-relaxed text-risk-high" role="alert">{paymentError}</p>}
            </Card>

            <Card className="space-y-2 text-sm text-mist-400">
              <p className="font-semibold text-mist-200">Before continuing</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Only sign if the wallet shows the same MUSD amount and Mezo Testnet.</li>
                <li>Buyer authorizations are signed in your wallet; this app never receives your private key.</li>
                <li>After signing, wait for a valid facilitator receipt before treating the payment as complete.</li>
              </ul>
            </Card>
          </>
        ) : null}

        <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-mist-500">
          <span>Mezo x402 Testnet checkout</span>
          <a href="https://mezo.org/docs/developers/getting-started/musd-payments-x402/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 hover:text-gold-300">
            Mezo x402 docs <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </footer>
      </div>
    </main>
  );
}
