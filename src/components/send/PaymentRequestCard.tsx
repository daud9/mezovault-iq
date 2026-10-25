import { useState } from "react";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { ChoiceGroup } from "../forms/ChoiceGroup";
import { FormErrors } from "../forms/FormErrors";
import { useWallet } from "../wallet/WalletProvider";
import { buildSendQuery, type PaymentToken } from "../../lib/paymentRequest";

/** Creates a link that asks someone to pay the connected wallet. The link only pre-fills Send. */
export function PaymentRequestCard() {
  const { state } = useWallet();
  const [token, setToken] = useState<PaymentToken>("BTC");
  const [amount, setAmount] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const to = state.address;

  function generate() {
    setErrors([]);
    setLink(null);
    if (!to) return setErrors(["Connect a wallet to create a payment request."]);
    try {
      const query = buildSendQuery({ to, token, amount: amount.trim() });
      setLink(`${window.location.origin}/app/send?${query}`);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "The request could not be created."]);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-mist-100">Request a payment</h2>
        <p className="mt-1 text-xs leading-relaxed text-mist-500">
          Creates a link to your connected address. The payer must review and confirm the payment in their own wallet. The link moves no funds.
        </p>
      </div>
      <ChoiceGroup label="Token" value={token} options={[{ value: "BTC", label: "BTC" }, { value: "MUSD", label: "MUSD" }]} onChange={setToken} />
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
      {link && (
        <div className="space-y-2">
          <label htmlFor="request-link" className="text-xs text-mist-500">Share this link</label>
          <input id="request-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-xl border border-line bg-ink-800 px-3 py-2.5 font-mono text-xs text-mist-200" />
        </div>
      )}
    </Card>
  );
}
