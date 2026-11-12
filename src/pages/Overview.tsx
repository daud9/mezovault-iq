import { ExternalLink } from "lucide-react";
import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DataStatus } from "../components/ui/DataStatus";
import { MusdBalanceCard } from "../components/balance/MusdBalanceCard";
import { BtcBalanceCard } from "../components/balance/BtcBalanceCard";
import { MezoBalanceCard } from "../components/balance/MezoBalanceCard";
import { TrovePositionCard } from "../components/balance/TrovePositionCard";
import { SupportCard } from "../components/support/SupportCard";
import { Link } from "react-router-dom";
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

      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-mist-500">Wallet balances</h2>
        <MusdBalanceCard />
        <div className="grid gap-6 md:grid-cols-2">
          <BtcBalanceCard />
          <MezoBalanceCard />
        </div>
      </div>

      <TrovePositionCard />

      <SupportCard />

      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-mist-500">Explore MezoVault IQ</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-mist-100">Your Trove</p>
            <p className="text-sm leading-relaxed text-mist-400">
              Read BTC collateral and MUSD debt. Use Trove Risk Lab for the live MCR comparison and hypothetical BTC price-drop scenarios. Only opening a new Trove is enabled; other management actions are not.
            </p>
            <Link to="/app/trove" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">
              Open Trove
            </Link>
          </Card>
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-mist-100">Protocol Evidence</p>
            <p className="text-sm leading-relaxed text-mist-400">Separate what is documented, deployed, source verified, and operationally tested. OpturaFi Range is only a candidate.</p>
            <Link to="/app/protocol-evidence" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">Open evidence board</Link>
          </Card>
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
            <p className="text-sm font-semibold text-mist-100">Trove Risk Lab</p>
            <p className="text-sm leading-relaxed text-mist-400">Compare live collateral, debt, ratio, and MCR distance with 10%, 20%, and 30% hypothetical BTC price drops. Read-only; no automated action.</p>
            <Link to="/app/trove-risk" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">Open Risk Lab</Link>
          </Card>
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-mist-100">Bridge Rescue Tracker</p>
            <p className="text-sm leading-relaxed text-mist-400">Check Wormholescan’s indexed status for recent Mezo Testnet MEZO NTT transfers. Read-only status only; no claim or rescue action is available.</p>
            <Link to="/app/bridge-rescue" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">Track a bridge transfer</Link>
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
              Trove reads and shares in the documented Mezo basic pools are supported elsewhere in the app. Broader
              protocols remain unavailable until their testnet contracts and readable positions are verified.
            </p>
            <div className="flex flex-wrap gap-x-4">
              <Link to="/app/trove" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">View Trove</Link>
              <Link to="/app/protocol-evidence" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">View Protocol Evidence</Link>
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
