import { ShieldCheck } from "lucide-react";
import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DataStatus } from "../components/ui/DataStatus";

const NOT_IMPLEMENTED = [
  "Monitoring of balances or positions (no background checks run)",
  "Alerts or notifications",
  "Rebalancing or any transaction execution",
  "On-chain spending or allocation limits",
];

const ROADMAP = [
  "A verified data source for each monitored figure, shown with its timestamp",
  "Explicit approval in your wallet for every action, with no standing permissions",
  "Limits you set, checked in the app before any request is sent",
  "A dry-run preview of exactly what would happen, before anything can execute",
  "An independent security audit before any automation can move funds",
];

export function Autopilot() {
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Autopilot"
        title="Automation is not active"
        description="No automation runs in this app. Nothing is monitored in the background, and nothing is sent or moved on your behalf."
      />

      <Card highlight className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-gold-400" aria-hidden="true" />
            <h2 className="text-base font-semibold text-mist-100">Status</h2>
          </div>
          <DataStatus state="unavailable" detail="not implemented" />
        </div>
        <ul className="space-y-2 text-sm text-mist-400">
          {NOT_IMPLEMENTED.map((item) => (
            <li key={item} className="flex gap-3">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold-500" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold text-mist-100">Roadmap: requirements before any automation</h2>
        <ol className="space-y-3 text-sm leading-relaxed text-mist-400">
          {ROADMAP.map((item, i) => (
            <li key={item} className="flex gap-3">
              <span className="text-xs font-semibold text-gold-500">{i + 1}.</span>
              {item}
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
