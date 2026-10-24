import { SectionHeader } from "../components/ui/SectionHeader";
import { Card } from "../components/ui/Card";
import { DemoLabel } from "../components/ui/DemoLabel";
import { EmptyState } from "../components/ui/StateViews";
import { WalletButton } from "../components/layout/WalletButton";

export function Activity() {
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Activity"
        title="Transaction and event history"
        description="A chronological record of deposits, withdrawals, rebalances and automation events. Transaction history is not implemented yet."
        actions={<DemoLabel note="No live data" />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {["Deposits", "Withdrawals", "Automation events"].map((label) => (
          <Card key={label}>
            <p className="text-xs font-medium uppercase tracking-wider text-mist-500">{label}</p>
            <p className="mt-3 text-xl font-semibold text-mist-400">None recorded</p>
          </Card>
        ))}
      </div>

      <EmptyState
        title="No activity to show"
        description="Transaction history is not implemented yet, so no on-chain activity is shown. Wallet balances are read on the Overview page."
        action={<WalletButton />}
      />
    </div>
  );
}
