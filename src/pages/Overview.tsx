import { ExternalLink } from "lucide-react";
import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DataStatus } from "../components/ui/DataStatus";
import { MusdBalanceCard } from "../components/balance/MusdBalanceCard";
import { BtcBalanceCard } from "../components/balance/BtcBalanceCard";
import { MezoBalanceCard } from "../components/balance/MezoBalanceCard";
import { LoanCard } from "../components/balance/LoanCard";
import { SupportCard } from "../components/support/SupportCard";
import { Link } from "react-router-dom";
import { OFFICIAL_SOURCES } from "../config/chains";
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
        <LoanCard />
      </div>

      <SupportCard />

      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-mist-500">Next steps</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-mist-100">Smart Vaults</p>
            <p className="text-sm leading-relaxed text-mist-400">See which vaults are verified on Mezo Testnet, and what is needed to activate the rest.</p>
            <Link to="/app/smart-vaults" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">Open Smart Vaults</Link>
          </Card>
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-mist-100">Borrow MUSD against BTC</p>
            <p className="text-sm leading-relaxed text-mist-400">Borrowing is done in the official Mezo borrow page. This app does not build borrow transactions yet.</p>
            <a href={OFFICIAL_SOURCES.mezoBorrowApp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">Open the official borrow page</a>
            <p className="text-xs leading-relaxed text-mist-500">The official testnet guide uses this page while connected to Mezo Testnet.</p>
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
        <h2 className="text-xs font-semibold uppercase tracking-wider text-mist-500">What is not available yet</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-mist-100">Portfolio valuation</p>
            <DataStatus state="unavailable" detail="no price source" />
            <p className="text-sm leading-relaxed text-mist-400">
              A total in dollars needs a reliable price feed for MUSD and BTC on Mezo Testnet. None is connected, so no total is shown.
            </p>
          </Card>
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-mist-100">DeFi positions</p>
            <DataStatus state="unavailable" detail="no verified contracts" />
            <p className="text-sm leading-relaxed text-mist-400">
              Deposits and loans appear here once a protocol with a verified testnet address and readable balances is confirmed.
            </p>
          </Card>
          <Card className="space-y-3">
            <p className="text-sm font-semibold text-mist-100">Transactions</p>
            <DataStatus state="unavailable" detail="no history source" />
            <p className="text-sm leading-relaxed text-mist-400">
              Transaction history needs an explorer API that is not yet connected. See the Activity page.
            </p>
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
