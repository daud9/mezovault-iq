import { Link } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { PoolPositionsCard } from "../components/balance/PoolPositionsCard";
import { ProtocolEvidenceBoard } from "../components/vaults/ProtocolEvidenceBoard";

export function ProtocolEvidence() {
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Smart Vaults · Vault Intelligence"
        title="Protocol Evidence"
        description="A read-only record of what is documented, deployed, source verified, and operationally tested. No vault yield or protocol safety claim is inferred from an address alone."
      />
      <ProtocolEvidenceBoard />
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-mist-100">Existing pool positions</h2>
            <p className="mt-1 text-sm text-mist-400">Wallet-specific LP balance reads remain separate from market-wide pool reserves.</p>
          </div>
          <Link to="/app/pools" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">Open Pool Watch</Link>
        </div>
        <PoolPositionsCard />
      </section>
      <Card className="space-y-3 text-sm leading-relaxed text-mist-400">
        <p className="font-medium text-mist-200">Not enabled from this board</p>
        <p>Vault deposits and withdrawals, yield calculations, swaps, automated actions, and Trove management other than opening a new Trove are not enabled. The open-only flow is Testnet-only and requires fresh preflight plus wallet confirmation. OpturaFi Range appears only as an unvalidated candidate; its implementation, assets, and operation are not established here.</p>
      </Card>
    </div>
  );
}
