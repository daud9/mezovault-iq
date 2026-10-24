import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DemoLabel } from "../components/ui/DemoLabel";
import { EmptyState } from "../components/ui/StateViews";
import { ComingSoon } from "../components/ui/ComingSoon";
import { ProtocolTable } from "../components/vaults/ProtocolTable";
import { DEMO_VAULT_METRICS } from "../data/demo";

export function VaultIntelligence() {
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Vault Intelligence"
        title="Evaluate vaults before capital moves"
        description="Metric definitions and their status. Live vault data needs an indexer that is not connected in Stage 1."
        actions={<DemoLabel note="Definitions only" />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {DEMO_VAULT_METRICS.map((m) => (
          <Card key={m.id}>
            <p className="text-xs font-medium uppercase tracking-wider text-mist-500">{m.name}</p>
            <p className="mt-3 text-xl font-semibold text-mist-300">{m.value}</p>
            <p className="mt-3 text-sm leading-relaxed text-mist-400">{m.explanation}</p>
          </Card>
        ))}
      </div>

      <EmptyState
        title="No vault data loaded"
        description="Vault lists, contract checks and collateral analysis will appear here when a data source is connected. No vault figures are shown as live."
      />

      <ProtocolTable />

      <ComingSoon
        stage="Stage 2"
        items={[
          "Live vault list from an indexer",
          "Verified contract addresses and audit links",
          "Collateral quality and concentration checks",
          "Liquidation and utilisation alerts",
        ]}
      />
    </div>
  );
}
