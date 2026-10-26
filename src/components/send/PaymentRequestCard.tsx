import { useState } from "react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { ChoiceGroup } from "../forms/ChoiceGroup";
import { FormErrors } from "../forms/FormErrors";
import { DataStatus } from "../ui/DataStatus";
import { useWallet } from "../wallet/WalletProvider";
import { useMezoBalance } from "../../hooks/useMezoBalance";
import { buildSendQuery, type PaymentToken } from "../../lib/paymentRequest";
import { parseAmount } from "../../lib/transfer";
import { shortAddress } from "../../lib/format";

/** Creates a payment-request link to the connected address. The link never sends funds. */
export function PaymentRequestCard() {
  const { state, network } = useWallet();
  const mezo = useMezoBalance();
  const mezoVerified = mezo.view.status === "done" && mezo.view.result.status === "ok";

  const [token, setToken] = useState<PaymentToken>("BTC");
  const [amount, setAmount] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const to = state.address;
  const decimals = token === "MEZO" ? (mezo.view.status === "done" && mezo.view.result.status === "ok" ? mezo.view.result.decimals : 18) : 18;

  const options: { value: PaymentToken; label: string }[] = [
    { value: "BTC", label: "BTC" },
    { value: "MUSD", label: "MUSD" },
  ];
  if (mezoVerified) options.push({ value: "MEZO", label: "MEZO" });

  function generate() {
    setErrors([]);
    setLink(null);
    setCopied(false);
    if (!to) return setErrors(["Connect a wallet to create a payment request."]);
    const parsed = parseAmount(amount, decimals);
    if (!parsed.ok) return setErrors([parsed.error]);
    try {
      const query = buildSendQuery({ to, token, amount: amount.trim() });
      setLink(`${window.location.origin}/app/pay?${query}`);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "The request could not be created."]);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setErrors(["Copy is not available in this browser. Select the link and copy it manually."]);
    }
  }

  async function share() {
    if (!link || typeof navigator.share !== "function") return;
    try {
      await navigator.share({ title: `Payment request: ${amount} ${token}`, url: link });
    } catch {
      // The user dismissed the share sheet. Nothing to report.
    }
  }

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-mist-100">Request a payment</h2>
        <p className="mt-1 text-xs leading-relaxed text-mist-500">
          Creates a link that asks someone to pay this connected address. The payer reviews and confirms in their own wallet. The link itself moves no funds.
        </p>
      </div>

      {!mezoVerified && (
        <DataStatus state="unavailable" detail="MEZO requests appear after the on-chain token check passes" />
      )}

      <ChoiceGroup label="Asset" value={token} options={options} onChange={(v) => { setToken(v); setLink(null); }} />
      <div className="space-y-1.5">
        <label htmlFor="request-amount" className="text-sm font-medium text-mist-100">Amount ({token})</label>
        <input
          id="request-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="w-full rounded-xl border border-line bg-ink-800 px-3 py-2.5 text-sm text-mist-100 outline-none focus:border-gold-500/60"
        />
      </div>
      <FormErrors errors={errors} />
      <Button onClick={generate} className="min-h-11 w-full">Create payment link</Button>

      {link && to && (
        <div className="space-y-3 rounded-xl border border-line bg-ink-800/60 p-4 text-sm">
          <p className="text-xs font-medium uppercase tracking-wider text-gold-400">Request summary</p>
          <p className="text-mist-100">{amount} {token}</p>
          <p className="font-mono text-xs text-mist-400">To {shortAddress(to)} on {network.label} (chain {network.chainId})</p>
          <label htmlFor="request-link" className="text-xs text-mist-500">Share this link</label>
          <input id="request-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-xl border border-line bg-ink-900 px-3 py-2.5 font-mono text-xs text-mist-200" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="secondary" onClick={copy} className="min-h-11">{copied ? "Copied" : "Copy link"}</Button>
            {canShare && <Button variant="secondary" onClick={share} className="min-h-11">Share</Button>}
          </div>
        </div>
      )}
    </Card>
  );
}
