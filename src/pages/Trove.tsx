import { StabilityPoolPanel } from "../components/balance/StabilityPoolPanel";
import { LoanCard } from "../components/balance/LoanCard";
import { SectionHeader } from "../components/ui/SectionHeader";

export function Trove() {
  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Mezo Testnet"
        title="Trove"
      />
      <LoanCard />
      <StabilityPoolPanel />
    </div>
  );
}
