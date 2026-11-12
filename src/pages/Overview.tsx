import { ExternalLink } from "lucide-react";
import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DataStatus } from "../components/ui/DataStatus";
import { MusdBalanceCard } from "../components/balance/MusdBalanceCard";
import { BtcBalanceCard } from "../components/balance/BtcBalanceCard";
import { MezoBalanceCard } from "../components/balance/MezoBalanceCard";
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
        title="Your wallet on Mezo Testnet"
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

      <SupportCard />

      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-mist-500">Explore MezoVault IQ</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-mist-100">Your Trove</p>
            <p className="text-sm leading-relaxed text-mist-400">
              View current BTC collateral, MUSD debt and the informational collateral ratio. If no trove is active, a
              preview is available; the only in-app wallet request is a fixed test limited to one approved wallet, not
              general borrowing.
              Trove management actions are disabled.
            </p>
            <Link to="/app/trove" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">
              Open Trove
            </Link>
          </Card>
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-mist-100">Smart Vaults</p>
            <p className="text-sm leading-relaxed text-mist-400">See which vaults are verified on Mezo Testnet, and what is needed to activate the rest.</p>
            <Link to="/app/smart-vaults" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">Open Smart Vaults</Link>
          </Card>
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-mist-100">Activity</p>
            <p className="text-sm leading-relaxed text-mist-400">Review recent MUSD and MEZO transfers plus transactions sent from this app in this browser.</p>
            <Link to="/app/activity" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">Open Activity</Link>
          </Card>
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-mist-100">Swap MUSD and BTC</p>
            <p className="text-sm leading-relaxed text-mist-400">
              Swapping is not available in MezoVault IQ. The official Mezo swap guide is documented for mainnet, and no testnet swap link is verified, so none is shown here.
            </p>
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
              <Link to="/app/vaults" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">View verified positions</Link>
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
          View this wallet on the Mezo Testnet explorer <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
