import { useState, type FormEvent } from "react";
import { ExternalLink, Search, ShieldAlert } from "lucide-react";
import { MEZO_TESTNET_NTT } from "../config/bridge";
import { useWallet } from "../components/wallet/WalletProvider";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { DataStatus } from "../components/ui/DataStatus";
import { FormErrors } from "../components/forms/FormErrors";
import { SectionHeader } from "../components/ui/SectionHeader";
import { getBridgeStage, lookupMezoNttTransaction, operationRoute, type BridgeLookupResult } from "../lib/bridgeTracker";

function stageDescription(result: BridgeLookupResult): { title: string; body: string; state: "unverified" } {
  switch (result.stage) {
    case "destination-indexed":
      return { title: "Destination execution indexed", body: "Wormholescan has a destination-chain transaction record. This tracker reports indexing, not a separate guarantee about the destination transaction's finality.", state: "unverified" };
    case "attestation-available":
      return { title: "Attestation available; destination not indexed", body: "Wormholescan reports a VAA for this operation, but no destination transaction record is indexed yet.", state: "unverified" };
    case "source-indexed":
      return { title: "Source operation indexed", body: "Wormholescan has the Mezo-side operation, but no VAA or destination record is present in this response.", state: "unverified" };
    default:
      return { title: "Operation status unclear", body: "The indexed operation does not contain enough status fields for this tracker to describe progress.", state: "unverified" };
  }
}

export function BridgeStatusTracker() {
  const { network } = useWallet();
  const testnetSelected = network.key === "testnet";
  const [transactionHash, setTransactionHash] = useState("");
  const [result, setResult] = useState<BridgeLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function track(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setError(null);
    if (!testnetSelected) {
      setError("This tracker is scoped to Mezo Testnet. No Mainnet lookup was made.");
      return;
    }
    setLoading(true);
    try {
      setResult(await lookupMezoNttTransaction(transactionHash));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bridge status lookup failed.");
    } finally {
      setLoading(false);
    }
  }

  const sourceTxHash = result?.operation?.sourceChain?.transaction?.txHash;
  const destinationTxHash = result?.operation?.targetChain?.transaction?.txHash;
  const route = result?.operation ? operationRoute(result.operation) : null;
  const stageInfo = result?.operation ? stageDescription({ ...result, stage: getBridgeStage(result.operation) }) : null;
  const sourceStatus = result?.operation?.sourceChain?.status;
  const destinationStatus = result?.operation?.targetChain?.status;
  const mezoExplorerUrl = sourceTxHash
    ? `${MEZO_TESTNET_NTT.explorerUrl}tx/${sourceTxHash}`
    : null;

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Read-only · Mezo Testnet"
        title="Bridge Status Tracker"
        description="Check Wormholescan’s indexed status for a MEZO NTT transfer that started on Mezo Testnet. This page only reports status; no supported recovery, claim, refund, or transaction action is available."
      />

      <Card className="space-y-5">
        <div className="flex items-start gap-3">
          <span className="rounded-xl border border-gold-500/30 bg-gold-500/10 p-2 text-gold-300"><Search className="h-5 w-5" aria-hidden="true" /></span>
          <div>
            <h2 className="text-sm font-semibold text-mist-100">Track a Mezo Testnet source transaction</h2>
            <p className="mt-1 text-sm leading-relaxed text-mist-400">Paste the `0x` transaction hash from the Mezo-side NTT transfer. The lookup checks the latest 100 indexed operations for the official Testnet Wormhole transceiver.</p>
          </div>
        </div>

        <form onSubmit={track} className="space-y-3">
          <label htmlFor="bridge-tx-hash" className="text-sm font-medium text-mist-100">Mezo Testnet transaction hash</label>
          <input
            id="bridge-tx-hash"
            value={transactionHash}
            onChange={(event) => { setTransactionHash(event.currentTarget.value); setResult(null); setError(null); }}
            placeholder="0x… (64 hexadecimal characters)"
            autoComplete="off"
            spellCheck={false}
            disabled={!testnetSelected || loading}
            className="w-full rounded-xl border border-line bg-ink-800 px-3 py-3 font-mono text-sm text-mist-100 outline-none focus:border-gold-500/60"
          />
          {!testnetSelected && <p className="text-sm text-risk-medium" role="status">This page only checks Mezo Testnet MEZO NTT transfers; the configured app network is {network.label}.</p>}
          <FormErrors errors={error ? [error] : []} />
          <Button type="submit" disabled={!testnetSelected || loading} className="min-h-11 w-full sm:w-auto">
            {loading ? "Checking Wormholescan…" : "Track bridge status"}
          </Button>
        </form>

        {result?.stage === "not-found" && (
          <div className="space-y-3 rounded-xl border border-risk-medium/30 bg-risk-medium/5 p-4" role="status">
            <DataStatus state="unverified" detail="no matching operation in indexed page" />
            <p className="text-sm leading-relaxed text-mist-300">No matching source transaction was found among the latest {result.pageSize} indexed operations for this transceiver. This does <strong className="text-mist-100">not</strong> prove the transfer failed: the hash may be outside this recent page, not indexed yet, or not be a Mezo Testnet MEZO NTT transfer.</p>
          </div>
        )}

        {result?.operation && stageInfo && (
          <div className="space-y-4 rounded-xl border border-line bg-ink-800/60 p-4" role="status">
            <div className="space-y-2">
              <DataStatus state={stageInfo.state} detail={stageInfo.title} />
              <p className="text-sm leading-relaxed text-mist-300">{stageInfo.body}</p>
            </div>
            {route && (route.fromChain !== null || route.toChain !== null) && (
              <p className="text-xs text-mist-500">Wormhole route IDs: {route.fromChain ?? "unknown"} → {route.toChain ?? "unknown"}</p>
            )}
            {sourceTxHash && (
              <div className="space-y-1">
                <p className="text-xs text-mist-500">Source transaction{sourceStatus ? ` · ${sourceStatus}` : ""}</p>
                <a href={mezoExplorerUrl!} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-xs text-gold-300 hover:underline">{sourceTxHash} <ExternalLink className="inline h-3 w-3" aria-hidden="true" /></a>
              </div>
            )}
            {destinationTxHash && (
              <div className="space-y-1">
                <p className="text-xs text-mist-500">Destination transaction{destinationStatus ? ` · ${destinationStatus}` : ""}</p>
                <p className="break-all font-mono text-xs text-mist-200">{destinationTxHash}</p>
              </div>
            )}
            {result.operation.sequence && <p className="text-xs text-mist-500">Wormhole sequence: {result.operation.sequence}</p>}
          </div>
        )}
      </Card>

      <Card className="space-y-4 border-risk-medium/30">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-risk-medium" aria-hidden="true" />
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-mist-100">Status tracking cannot recover a transfer</h2>
            <p className="text-sm leading-relaxed text-mist-400">Mezo’s Testnet bridge docs describe MEZO transfers through Wormhole NTT and tell users to wait for confirmation on both chains. They do not document a Testnet rescue, refund, or manual-claim action. A missing or pending index entry is not permission to retry the transfer.</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <a href={MEZO_TESTNET_NTT.bridgeDocs} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-gold-300 hover:underline">Mezo Testnet bridge docs <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
              <a href={MEZO_TESTNET_NTT.wormholescanDocs} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-gold-300 hover:underline">Wormholescan API guide <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
            </div>
          </div>
        </div>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-mist-100">Legacy Mainnet native-BTC deposits</h2>
        <p className="text-sm leading-relaxed text-mist-400">The separate Mezo Mainnet native-BTC bridge-in closed on October 13, 2026. Mezo directs deposits started before closure to tBTCScan for status checks. That flow is not the Mezo Testnet NTT tracker above.</p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <a href="https://mezo.org/docs/users/mainnet/track-your-native-bitcoin-deposit/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-gold-300 hover:underline">Mezo deposit tracking guide <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
          <a href="https://tbtcscan.com/deposits" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-gold-300 hover:underline">Open tBTCScan deposits <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
        </div>
      </Card>

      <p className="text-xs leading-relaxed text-mist-500">Lookup source: <a href={MEZO_TESTNET_NTT.deploymentSource} target="_blank" rel="noopener noreferrer" className="text-gold-300 hover:underline">official Mezo Testnet NTT deployment manifest</a>. Wormholescan receives only the configured transceiver address; the pasted transaction hash is matched in the browser and is not included in the API request. Selected app network: {network.label}.</p>
    </div>
  );
}
