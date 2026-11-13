import { ExternalLink } from "lucide-react";
import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DataStatus } from "../components/ui/DataStatus";
import { MusdBalanceCard } from "../components/balance/MusdBalanceCard";
import { BtcBalanceCard } from "../components/balance/BtcBalanceCard";
import { MezoBalanceCard } from "../components/balance/MezoBalanceCard";
import { Link } from "react-router-dom";
import { ButtonLink } from "../components/ui/Button";
import { useWallet } from "../components/wallet/WalletProvider";

export function Overview() {
  const { network, state } = useWallet();
  const explorerAddressUrl =
    state.address ? `${network.explorerUrl.replace(/\/?$/, "/")}address/${state.address}` : null;

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Overview"
        title={`Your wallet on ${network.label}`}
        description="Every figure on this page comes from the chain or is marked unavailable. No demonstration values are shown."
      />

      <Card className="space-y-3 border-gold-500/30 bg-ink-800/60">
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-300">Main demo · MUSD</p>
        <h2 className="text-lg font-semibold text-mist-100">Swap wallet-held MUSD for pool BTC</h2>
        <p className="text-sm leading-relaxed text-mist-400">Testnet only. The wallet needs MUSD to swap and native BTC for fees; MUSD deposited in the Stability Pool is not included. The output is a BTC ERC-20 token, not native gas BTC.</p>
        <ButtonLink to="/app/swap" className="min-h-11">Open MUSD Swap</ButtonLink>
      </Card>

      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-mist-500">Wallet balances</h2>
        <MusdBalanceCard />
        <div className="grid gap-6 md:grid-cols-2">
          <BtcBalanceCard />
          <MezoBalanceCard />
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-mist-500">Explore MezoVault IQ</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-mist-100">Pool Watch</p>
            <p className="text-sm leading-relaxed text-mist-400">Read official Testnet pool reserves and reserve-implied spot prices. Fee tiers and USD liquidity are not verified; no APY or pool recommendation is shown.</p>
            <Link to="/app/pools" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">Open Pool Watch</Link>
          </Card>
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-mist-100">Activity</p>
            <p className="text-sm leading-relaxed text-mist-400">Review bounded MUSD/MEZO transfer logs with a coverage map and CSV export, alongside transactions submitted from this browser.</p>
            <Link to="/app/activity" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">Open Activity</Link>
          </Card>
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-mist-100">Bridge Status Tracker</p>
            <p className="text-sm leading-relaxed text-mist-400">Check Wormholescan’s indexed status for recent Mezo Testnet MEZO NTT transfers. Read-only status only; no claim or rescue action is available.</p>
            <Link to="/app/bridge-status" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">Open Bridge Status Tracker</Link>
          </Card>
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-mist-100">Gasless MUSD Pay Links</p>
            <p className="text-sm leading-relaxed text-mist-400">Create a recipient-bound MUSD link for Mezo Testnet. Buyers sign in their own wallet; the x402 facilitator verifies and settles payment, paying BTC gas. Check merchant readiness before creating a link.</p>
            <Link to="/app/pay-links" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">Open MUSD Pay Links</Link>
          </Card>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-mist-500">Data coverage limits</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-mist-100">Portfolio valuation</p>
            <DataStatus state="unverified" detail="BTC-only estimate" />
            <p className="text-sm leading-relaxed text-mist-400">
              The BTC card shows a partial estimate for the native BTC balance when Mezo's BTC/USD oracle is fresh. This is
              not a portfolio total: MUSD and MEZO are not assigned a USD price, and Trove, pool, and other DeFi positions
              are excluded.
            </p>
          </Card>
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-mist-100">DeFi positions</p>
            <DataStatus state="unverified" detail="partial coverage" />
            <p className="text-sm leading-relaxed text-mist-400">
              Read-only Mezo pool positions are available in dedicated tools. Trove tools remain on their own route and
              are not part of the MUSD swap demo path; broader protocols remain unavailable until verified.
            </p>
            <div className="flex flex-wrap gap-x-4">
              <Link to="/app/pools" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">View Pool Watch</Link>
            </div>
          </Card>
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-mist-100">Transaction history</p>
            <DataStatus state="unverified" detail="partial history" />
            <p className="text-sm leading-relaxed text-mist-400">
              Activity reads MUSD/MEZO Transfer events in the latest 5,000 blocks, with older 5,000-block pages available
              on demand, plus local app submissions. Native BTC transfers and other non-token activity still need an
              indexed history source.
            </p>
            <Link to="/app/activity" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">Open Activity</Link>
          </Card>
        </div>
      </div>

      {explorerAddressUrl && (
        <a
          href={explorerAddressUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-gold-300 hover:underline"
        >
          View this wallet on the {network.label} explorer <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
