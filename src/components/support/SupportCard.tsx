import { Link } from "react-router-dom";
import { Card } from "../ui/Card";
import { DataStatus } from "../ui/DataStatus";
import { SUPPORT_ADDRESS, SUPPORT_PRESETS } from "../../config/support";
import { shortAddress } from "../../lib/format";
import { buildSendQuery } from "../../lib/paymentRequest";
import { useMezoBalance } from "../../hooks/useMezoBalance";

/**
 * Two routes per asset: review a preset amount, or open Mezo Pay with the recipient and asset
 * filled in so the amount can be entered manually. MEZO appears only after its on-chain check passes.
 * Nothing is sent until the user confirms in their wallet.
 */
export function SupportCard() {
  const mezo = useMezoBalance();
  const mezoVerified = mezo.view.status === "done" && mezo.view.result.status === "ok";
  const presets = SUPPORT_PRESETS.filter((p) => p.token !== "MEZO" || mezoVerified);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-mist-100">Support this project</h2>
        <p className="mt-1 text-xs leading-relaxed text-mist-500">
          Recipient {shortAddress(SUPPORT_ADDRESS)}. Nothing is sent until you confirm in your wallet.
        </p>
      </div>
      {!mezoVerified && (
        <DataStatus state="unavailable" detail="MEZO appears after the on-chain token check passes" />
      )}
      <div className="space-y-3">
        {presets.map((p) => (
          <div key={p.label} className="grid gap-3 sm:grid-cols-2">
            <Link
              to={`/app/pay?${buildSendQuery({ to: SUPPORT_ADDRESS, token: p.token, amount: p.amount })}`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gold-500/50 bg-gold-500/10 px-4 text-sm font-semibold text-gold-300 hover:bg-gold-500/20"
            >
              Review {p.label}
            </Link>
            <Link
              to={`/app/send?${new URLSearchParams({ to: SUPPORT_ADDRESS, token: p.token }).toString()}`}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-ink-800 px-4 text-sm font-semibold text-mist-200 hover:border-gold-500/50"
            >
              Enter {p.token} amount manually
            </Link>
          </div>
        ))}
      </div>
    </Card>
  );
}
