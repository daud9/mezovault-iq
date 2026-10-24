import { ShieldCheck } from "lucide-react";
import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DemoLabel } from "../components/ui/DemoLabel";
import { ComingSoon } from "../components/ui/ComingSoon";

const RULES = [
  "Every permission is explicit, scoped and revocable by the user.",
  "Limits on amount, asset, destination and frequency are set before anything runs.",
  "No automation is enabled by default, and none runs without a connected wallet.",
];

export function Autopilot() {
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Autopilot"
        title="Permissioned automation"
        description="Future rebalancing that acts only within limits you define and can switch off at any time."
        actions={<DemoLabel note="Not active" />}
      />

      <Card highlight className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-gold-400" aria-hidden="true" />
          <h2 className="text-base font-semibold text-mist-100">Design principles</h2>
        </div>
        <ul className="space-y-3 text-sm leading-relaxed text-mist-400">
          {RULES.map((r) => (
            <li key={r} className="flex gap-3">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold-400" aria-hidden="true" />
              {r}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <label className="flex cursor-not-allowed items-center gap-3 text-sm text-mist-500">
            <input type="checkbox" disabled className="h-4 w-4 accent-[var(--color-gold-400)]" />
            Enable Autopilot (unavailable in Stage 1)
          </label>
        </div>
      </Card>

      <ComingSoon
        stage="Stage 3"
        items={[
          "Spending and allocation limits per asset",
          "Per-strategy permission scopes",
          "Pause and revoke controls",
          "Full transaction log with explanations",
        ]}
      />
    </div>
  );
}
