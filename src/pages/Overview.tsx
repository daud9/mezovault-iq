import { Coins, Layers, Percent, ShieldAlert } from "lucide-react";
import { Card } from "../components/ui/Card";
import { StatCard } from "../components/ui/StatCard";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DemoLabel } from "../components/ui/DemoLabel";
import { EmptyState } from "../components/ui/StateViews";
import { DEMO_ALLOCATION, DEMO_PORTFOLIO_VALUE_USD, DEMO_STRATEGIES } from "../data/demo";
import { formatRange, formatUsd } from "../lib/format";
import { RiskBadge } from "../components/ui/Badge";

export function Overview() {
  const weightedLow = DEMO_STRATEGIES.reduce((a, s) => a + s.illustrativeApy[0], 0) / DEMO_STRATEGIES.length;
  const weightedHigh = DEMO_STRATEGIES.reduce((a, s) => a + s.illustrativeApy[1], 0) / DEMO_STRATEGIES.length;

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Overview"
        title="Your portfolio at a glance"
        description="Balances and figures below are demonstration data. Connect a wallet in Stage 2 to view real positions."
        actions={<DemoLabel note="Demo portfolio" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Portfolio value" value={formatUsd(DEMO_PORTFOLIO_VALUE_USD)} hint="Illustrative" icon={<Coins className="h-4 w-4" />} />
        <StatCard label="Illustrative APY band" value={`${weightedLow.toFixed(1)}–${weightedHigh.toFixed(1)}%`} hint="Average across demo strategies" icon={<Percent className="h-4 w-4" />} />
        <StatCard label="Active strategies" value="0" hint="No live positions" icon={<Layers className="h-4 w-4" />} />
        <StatCard label="Risk exposure" value="Medium" hint="Demo allocation mix" icon={<ShieldAlert className="h-4 w-4" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-mist-100">Demo allocation</h2>
            <DemoLabel />
          </div>
          <div className="space-y-5">
            {DEMO_ALLOCATION.map((b) => (
              <div key={b.id}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-mist-100">{b.label}</p>
                    <p className="truncate text-xs text-mist-500">{b.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <RiskBadge risk={b.risk} />
                    <span className="w-10 text-right font-semibold text-mist-200">{b.percent}%</span>
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-700">
                  <div className="h-full rounded-full bg-gradient-to-r from-gold-300 to-gold-500" style={{ width: `${b.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-mist-100">Recent activity</h2>
            <DemoLabel />
          </div>
          <EmptyState
            title="No transactions yet"
            description="Transactions appear here once a wallet is connected and activity is indexed in Stage 2."
          />
        </Card>
      </div>

      <Card className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-mist-100">Next step</p>
          <p className="mt-1 text-sm text-mist-400">
            Review the IQ Strategies to understand the mechanics behind each allocation bucket.
          </p>
        </div>
        <p className="text-xs text-mist-500">
          Example band: {formatRange(DEMO_STRATEGIES[0].illustrativeApy)} for {DEMO_STRATEGIES[0].name}
        </p>
      </Card>
    </div>
  );
}
