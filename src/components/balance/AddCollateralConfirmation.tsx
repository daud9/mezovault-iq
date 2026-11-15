import { CheckCircle2, ExternalLink } from "lucide-react";
import { MEZO_NETWORKS } from "../../config/chains";

export interface AddCollateralConfirmationReceipt {
  hash: string;
  blockNumber: number;
  amountBtc: string;
  account: string;
}

export function AddCollateralConfirmationNotice({ receipt }: { receipt: AddCollateralConfirmationReceipt }) {
  const explorerUrl = `${MEZO_NETWORKS.testnet.explorerUrl.replace(/\/?$/, "/")}tx/${receipt.hash}`;

  return (
    <section className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4" role="status" aria-label="Confirmed BTC collateral receipt">
      <div className="flex items-center gap-2 text-emerald-300">
        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        <h3 className="font-semibold">BTC addition confirmed</h3>
      </div>
      <p className="text-sm leading-relaxed text-mist-300">
        The receipt shows successful execution and a matching TroveUpdated(adjustTrove) event for {receipt.amountBtc} BTC in block {receipt.blockNumber.toLocaleString()}; finality is not independently checked.
      </p>
      <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 break-all font-mono text-xs text-gold-300 hover:underline">
        Transaction: {receipt.hash} <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </a>
    </section>
  );
}
