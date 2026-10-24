import { ShieldCheck } from "lucide-react";
import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DataStatus } from "../components/ui/DataStatus";

const NOT_IMPLEMENTED = [
  "Automated investing",
  "Monitoring of positions or balances",
  "Rebalancing or transaction execution",
  "Spending or allocation limits enforced on-chain",
];

export function Autopilot() {
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Autopilot"
        title="Automation is not active"
        description="No automation runs in this app. It does not monitor, rebalance, or send transactions, and it does not move funds."
      />

      <Card highlight className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-gold-400" aria-hidden="true" />
            <h2 className="text-base font-semibold text-mist-100">Status</h2>
          </div>
          <DataStatus state="unavailable" detail="not implemented" />
        </div>
        <p className="text-sm leading-relaxed text-mist-400">The following are not implemented:</p>
        <ul className="space-y-2 text-sm text-mist-400">
          {NOT_IMPLEMENTED.map((item) => (
            <li key={item} className="flex gap-3">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold-500" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p className="border-t border-line pt-4 text-xs leading-relaxed text-mist-500">
          Any future automation would need explicit, per-action permission from you, limits you set, and an audit before it
          could move funds.
        </p>
      </Card>
    </div>
  );
}
