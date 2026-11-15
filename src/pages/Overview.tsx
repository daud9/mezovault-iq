import { ExternalLink, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useWallet } from "../components/wallet/WalletProvider";
import { BtcBalanceCard } from "../components/balance/BtcBalanceCard";
import { MezoBalanceCard } from "../components/balance/MezoBalanceCard";
import { MusdBalanceCard } from "../components/balance/MusdBalanceCard";
import { PoolBtcBalanceCard } from "../components/balance/PoolBtcBalanceCard";
import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";

const FEATURED = [
  { title: "Trove", description: "Collateral, debt, and supported actions.", to: "/app/trove" },
  { title: "Trove Risk Lab", description: "Current ratio and hypothetical BTC scenarios.", to: "/app/trove-risk" },
];

const TOOLS = [
  { title: "Pool Watch", to: "/app/pools" },
  { title: "CL Positions", to: "/app/cl-positions" },
  { title: "CL Planner", to: "/app/cl-planner" },
  { title: "Chain Watch", to: "/app/chain-watch" },
  { title: "Bridge Status", to: "/app/bridge-status" },
  { title: "Activity", to: "/app/activity" },
];

export function Overview() {
  const { network, state } = useWallet();
  const explorerAddressUrl = state.address
    ? `${network.explorerUrl.replace(/\/?$/, "/")}address/${state.address}`
    : null;

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow={network.label}
        title="Overview"
        description="Wallet balances and protocol snapshots."
      />

      <section aria-labelledby="featured-tools-title" className="space-y-4">
        <h2 id="featured-tools-title" className="text-xs font-semibold uppercase tracking-wider text-mist-500">Core tools</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {FEATURED.map((feature) => (
            <Link key={feature.to} to={feature.to} className="group block rounded-2xl focus-visible:outline-offset-4">
              <Card highlight className="h-full transition group-hover:border-gold-500/50">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-mist-100">{feature.title}</h3>
                  <ArrowRight className="h-4 w-4 text-gold-300" aria-hidden="true" />
                </div>
                <p className="mt-2 text-sm text-mist-400">{feature.description}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="wallet-assets-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="wallet-assets-title" className="text-xs font-semibold uppercase tracking-wider text-mist-500">Wallet assets</h2>
            <p className="mt-1 text-sm text-mist-400">Balances are separate; only native BTC can be priced, when fresh.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MusdBalanceCard />
          <BtcBalanceCard />
          <MezoBalanceCard />
          <PoolBtcBalanceCard />
        </div>
        <p className="rounded-xl border border-line bg-ink-900 px-4 py-3 text-xs leading-relaxed text-mist-400">
          No combined portfolio total. A fresh Testnet oracle may price native BTC only; MUSD, MEZO, Pool BTC, and DeFi positions are excluded.
        </p>
      </section>

      <section aria-labelledby="protocol-tools-title" className="space-y-4">
        <h2 id="protocol-tools-title" className="text-xs font-semibold uppercase tracking-wider text-mist-500">Protocol tools</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {TOOLS.map((tool) => (
            <Link key={tool.to} to={tool.to} className="inline-flex min-h-12 items-center justify-between rounded-xl border border-line bg-ink-900 px-4 text-sm font-medium text-mist-200 transition hover:border-gold-500/40 hover:text-gold-300">
              {tool.title}<ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      {explorerAddressUrl && (
        <a
          href={explorerAddressUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-gold-300 hover:underline"
        >
          Wallet on {network.label} explorer <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
