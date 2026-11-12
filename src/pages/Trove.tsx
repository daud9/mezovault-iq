import { Link } from "react-router-dom";
import { LoanCard } from "../components/balance/LoanCard";
import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";

export function Trove() {
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Mezo Testnet · Trove"
        title="Your BTC-backed MUSD trove"
        description="Read the connected wallet’s collateral and debt. For the live MCR comparison and price-drop scenarios, open the separate read-only Trove Risk Lab."
      />

      <LoanCard />

      <Card className="space-y-3 text-sm leading-relaxed text-mist-400">
        <h2 className="font-semibold text-mist-100">What this page can do</h2>
        <p>
          The position is read from Mezo Testnet contracts. When no Trove is active, the planner can prepare a fresh review for opening a new Trove on Testnet.
        </p>
        <p>
          Opening a new Trove and adding BTC to an active Trove are available only after fresh same-block checks and simulation, and your own wallet must approve each transaction. Withdrawing, repaying, borrowing more, closing and liquidation are not available in this app.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link to="/app/trove-risk" className="inline-flex min-h-11 items-center font-medium text-gold-300 hover:underline">Open Trove Risk Lab</Link>
          <Link to="/app" className="inline-flex min-h-11 items-center font-medium text-gold-300 hover:underline">Back to Overview</Link>
        </div>
      </Card>
    </div>
  );
}
