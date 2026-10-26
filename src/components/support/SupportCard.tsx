import { Link } from "react-router-dom";
import { Card } from "../ui/Card";
import { SUPPORT_ADDRESS, SUPPORT_PRESETS } from "../../config/support";
import { shortAddress } from "../../lib/format";
import { buildSendQuery } from "../../lib/paymentRequest";

/** Opens the Send page with the support address pre-filled. The user reviews and confirms in their wallet. */
export function SupportCard() {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-mist-100">Support this project</h2>
        <p className="mt-1 text-xs leading-relaxed text-mist-500">
          Recipient {shortAddress(SUPPORT_ADDRESS)}. Pressing a button opens a review. Nothing is sent until you confirm in your wallet.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {SUPPORT_PRESETS.map((p) => (
          <Link
            key={p.label}
            to={`/app/pay?${buildSendQuery({ to: SUPPORT_ADDRESS, token: p.token, amount: p.amount })}`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gold-500/50 bg-gold-500/10 px-4 text-sm font-semibold text-gold-300 hover:bg-gold-500/20"
          >
            Review {p.label}
          </Link>
        ))}
      </div>
    </Card>
  );
}
