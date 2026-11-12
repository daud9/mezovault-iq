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
        description="Read the connected wallet’s live collateral, debt and collateral ratio. Trove management transactions are not enabled in this app."
      />

      <LoanCard />

      <Card className="space-y-3 text-sm leading-relaxed text-mist-400">
        <h2 className="font-semibold text-mist-100">What this page can do</h2>
        <p>
          The position and BTC/USD price are read from Mezo Testnet contracts. The collateral ratio is an informational
          figure, not a liquidation-risk verdict: a verified liquidation threshold is not displayed here.
        </p>
        <p>
          If the connected wallet has no active trove, the page retains a preview-only opening planner and a separate,
          fixed owner-approved test path for one wallet and one exact transaction. That test is not a general borrowing
          feature. Add-collateral, withdrawal, repayment, additional borrowing and close actions remain disabled.
        </p>
        <Link to="/app" className="inline-flex min-h-11 items-center font-medium text-gold-300 hover:underline">
          Back to Overview
        </Link>
      </Card>
    </div>
  );
}
