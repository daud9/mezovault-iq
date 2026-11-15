import { useState } from "react";
import { StabilityPoolPanel } from "../components/balance/StabilityPoolPanel";
import { LoanCard } from "../components/balance/LoanCard";
import { SectionHeader } from "../components/ui/SectionHeader";

export function Trove() {
  const [stabilityPoolOpen, setStabilityPoolOpen] = useState(false);
  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Mezo Testnet"
        title="Trove"
        description="Collateral, debt, and supported position actions."
      />
      <LoanCard />

      <details
        className="rounded-xl border border-line bg-ink-900/70 px-4"
        onToggle={(event) => setStabilityPoolOpen(event.currentTarget.open)}
      >
        <summary className="min-h-12 cursor-pointer py-3 text-sm font-semibold text-gold-300">
          Stability Pool
        </summary>
        <div className="space-y-4 pb-4">
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
            Liquidations can use deposited MUSD. Withdrawals may be delayed; no APY is guaranteed.
          </p>
          {stabilityPoolOpen && <StabilityPoolPanel />}
        </div>
      </details>
    </div>
  );
}
