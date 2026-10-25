import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DataStatus } from "../components/ui/DataStatus";
import { ProtocolTable } from "../components/vaults/ProtocolTable";
import { LoanCard } from "../components/balance/LoanCard";
import { PoolPositionsCard } from "../components/balance/PoolPositionsCard";

const METRICS = [
  { name: "Total value locked", needs: "a verified vault or lending contract on Mezo Testnet that reports its total assets" },
  { name: "Available liquidity", needs: "a verified contract that reports withdrawable or borrowable amounts" },
  { name: "Utilisation", needs: "a verified lending market that reports borrowed and supplied balances" },
  { name: "Share price", needs: "a verified vault token whose conversion function can be read" },
  { name: "Current yield", needs: "a reliable rate source, shown with its origin and timestamp" },
  { name: "Historical performance", needs: "an indexed history source for a verified contract" },
];

export function VaultIntelligence() {
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Vault Intelligence"
        title="Verified contracts and what is missing"
        description="Facts come from verified contracts and official pages. A metric is shown only when a reliable source provides it. Everything else is marked unavailable."
      />

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-mist-500">1. Verified contracts and availability</h2>
        <ProtocolTable />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-mist-500">2. Your positions</h2>
        <LoanCard />
        <PoolPositionsCard />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-mist-500">3. Vault metrics</h2>
        <p className="text-sm leading-relaxed text-mist-400">
          No testnet vault is verified, so none of these metrics can be read yet.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {METRICS.map((m) => (
            <Card key={m.name} className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-mist-500">{m.name}</p>
              <DataStatus state="unavailable" />
              <p className="text-sm leading-relaxed text-mist-400">
                <span className="text-mist-300">Needed:</span> {m.needs}.
              </p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
