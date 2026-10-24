import { ExternalLink } from "lucide-react";
import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DataStatus } from "../components/ui/DataStatus";
import { MusdBalanceCard } from "../components/balance/MusdBalanceCard";
import { BtcBalanceCard } from "../components/balance/BtcBalanceCard";
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

      <div className="grid gap-6 lg:grid-cols-2">
        <MusdBalanceCard />
        <BtcBalanceCard />
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
