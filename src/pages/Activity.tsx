import { ExternalLink } from "lucide-react";
import { SectionHeader } from "../components/ui/SectionHeader";
import { Card } from "../components/ui/Card";
import { DataStatus } from "../components/ui/DataStatus";
import { useWallet } from "../components/wallet/WalletProvider";

export function Activity() {
  const { state, network } = useWallet();
  const explorerUrl =
    state.address ? `${network.explorerUrl.replace(/\/?$/, "/")}address/${state.address}` : null;

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Activity"
        title="Transaction history"
        description="The app does not show transaction history yet, because no verified history source is connected. Nothing is shown in its place."
      />

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-mist-100">Wallet transactions</p>
          <DataStatus state="unavailable" detail="no history source connected" />
        </div>
        <p className="text-sm leading-relaxed text-mist-400">
          A complete list needs an explorer API for Mezo Testnet that returns this wallet's transactions. That API is not yet
          verified, so this page does not classify or list any transactions.
        </p>
        {explorerUrl ? (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-gold-300 hover:underline"
          >
            View this wallet on the explorer <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : (
          <p className="text-xs text-mist-500">Connect a wallet to link to its transactions on the explorer.</p>
        )}
      </Card>
    </div>
  );
}
