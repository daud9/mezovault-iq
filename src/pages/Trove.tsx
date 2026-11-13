import { useState } from "react";
import { StabilityPoolPanel } from "../components/balance/StabilityPoolPanel";
import { LoanCard } from "../components/balance/LoanCard";
import { SectionHeader } from "../components/ui/SectionHeader";

export function Trove() {
  const [stabilityPoolOpen, setStabilityPoolOpen] = useState(false);
  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Mezo Testnet · Trove"
        title="Your Trove"
        description="See your BTC collateral and MUSD debt. If you already have a Trove, add BTC to it below."
      />
      <LoanCard />

      <details
        className="rounded-xl border border-line bg-ink-900/70 px-4"
        onToggle={(event) => setStabilityPoolOpen(event.currentTarget.open)}
      >
        <summary className="min-h-12 cursor-pointer py-3 text-sm font-semibold text-gold-300">
          Optional: deposit borrowed MUSD
        </summary>
        <div className="space-y-4 pb-4">
          <p className="text-sm text-mist-400">
            This is separate from adding BTC to your Trove. If the Pool needs a new MUSD approval, you’ll confirm twice: approve the exact amount, then approve the deposit. If your current approval is enough, only the deposit confirmation is needed.
          </p>
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
            Risk: liquidations can reduce or use up deposited MUSD; withdrawals can be blocked or delayed; BTC gains are uncertain; this does not protect your own Trove; and no APY is promised.
          </p>
          {stabilityPoolOpen && <StabilityPoolPanel />}
        </div>
      </details>
    </div>
  );
}
