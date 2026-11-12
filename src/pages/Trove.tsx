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
          The position is read from Mezo Testnet contracts. This page keeps its existing read-only Trove view and fixed test path; it does not provide general position management.
        </p>
        <p>
          If the connected wallet has no active trove, the page retains a preview-only opening planner and a separate,
          fixed owner-approved test path for one wallet and one exact transaction. That test is not a general borrowing
          feature. Add-collateral, withdrawal, repayment, additional borrowing and close actions remain disabled.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link to="/app/trove-risk" className="inline-flex min-h-11 items-center font-medium text-gold-300 hover:underline">Open Trove Risk Lab</Link>
          <Link to="/app" className="inline-flex min-h-11 items-center font-medium text-gold-300 hover:underline">Back to Overview</Link>
        </div>
      </Card>
    </div>
  );
}
