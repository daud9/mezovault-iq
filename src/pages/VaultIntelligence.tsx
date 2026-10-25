import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DataStatus } from "../components/ui/DataStatus";
import { ProtocolTable } from "../components/vaults/ProtocolTable";
import { LoanCard } from "../components/balance/LoanCard";
import { PoolPositionsCard } from "../components/balance/PoolPositionsCard";

const METRICS = [
  { name: "Total value locked", needs: "A verified vault contract on Mezo Testnet that exposes its total assets." },
  { name: "Available liquidity", needs: "A verified contract that reports withdrawable or borrowable amounts." },
  { name: "Utilisation", needs: "A verified lending market that reports borrowed and supplied balances." },
  { name: "Share price", needs: "A verified vault token whose conversion function can be read." },
  { name: "Current yield", needs: "A verified rate source. An official rate feed or a readable rate function on a verified contract." },
  { name: "Historical performance", needs: "An indexed history source for a verified contract. None is connected." },
];

export function VaultIntelligence() {
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Vault Intelligence"
        title="Vault data from verified sources"
        description="Metrics appear only when a verified contract or data source provides them. Otherwise they are marked unavailable, with what is needed."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {METRICS.map((m) => (
          <Card key={m.name} className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wider text-mist-500">{m.name}</p>
            <DataStatus state="unavailable" />
            <p className="text-sm leading-relaxed text-mist-400">
              <span className="text-mist-300">Needed:</span> {m.needs}
            </p>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-mist-500">Your position</h2>
        <LoanCard />
        <PoolPositionsCard />
      </div>

      <ProtocolTable />
    </div>
  );
}
