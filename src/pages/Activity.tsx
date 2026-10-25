import { useEffect, useMemo, useState } from "react";
import { ExternalLink, ArrowDownLeft, ArrowUpRight, RefreshCw } from "lucide-react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DataStatus } from "../components/ui/DataStatus";
import { useWallet } from "../components/wallet/WalletProvider";
import { useMezoBalance } from "../hooks/useMezoBalance";
import { resolveRpcUrl } from "../config/env";
import { createRpcClient } from "../lib/rpc";
import { readRecentTransfers, type TransferLog } from "../lib/transferLogs";
import { browserStore, entriesFor, readLedger, updateEntry, type LedgerEntry } from "../lib/txLedger";
import { formatTokenUnits } from "../lib/tokenAmount";
import { formatTime, shortAddress } from "../lib/format";

/** Number of recent blocks searched for token transfers. Shown on the page, so the window is never hidden. */
const LOOKBACK_BLOCKS = 5000;

interface ChainTransfer {
  token: "MUSD" | "MEZO";
  log: TransferLog;
  decimals: number;
}

export function Activity() {
  const { state, network, isSupportedNetwork } = useWallet();
  const mezo = useMezoBalance();
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [transfers, setTransfers] = useState<ChainTransfer[] | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [tick, setTick] = useState(0);

  const address = state.address;
  const ready = state.status === "connected" && address !== null && isSupportedNetwork;
  const mezoDecimals = mezo.view.status === "done" && mezo.view.result.status === "ok" ? mezo.view.result.decimals : null;

  const mine = useMemo(
    () => (address ? entriesFor(ledger, address, network.chainId) : []),
    [ledger, address, network.chainId],
  );

  // Load the ledger, then re-check any pending transactions against their receipts.
  useEffect(() => {
    if (!ready || !address) return;
    const store = browserStore();
    const rpc = createRpcClient({ url: resolveRpcUrl(network) });
    const pending = readLedger(store).filter(
      (e) => e.status === "pending" && e.from.toLowerCase() === address.toLowerCase() && e.chainId === network.chainId,
    );
    setLedger(readLedger(store));
    let cancelled = false;
    (async () => {
      for (const e of pending) {
        try {
          const r = await rpc.call<{ status: string; blockNumber: string } | null>("eth_getTransactionReceipt", [e.hash]);
          if (r) updateEntry(store, e.hash, { status: r.status === "0x1" ? "success" : "reverted", blockNumber: Number(BigInt(r.blockNumber)) });
        } catch {
          // Keep it pending. It is rechecked on the next visit.
        }
      }
      if (!cancelled) setLedger(readLedger(store));
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, address, network, tick]);

  // Incoming and outgoing token transfers from the chain, for the tokens whose contracts are verified.
  useEffect(() => {
    if (!ready || !address || !network.musd) return;
    let cancelled = false;
    setLoadingTransfers(true);
    setTransferError(null);
    const rpc = createRpcClient({ url: resolveRpcUrl(network) });
    (async () => {
      try {
        const musd = await readRecentTransfers({ rpc, token: network.musd!.address, owner: address, lookbackBlocks: LOOKBACK_BLOCKS });
        const items: ChainTransfer[] = musd.map((log) => ({ token: "MUSD", log, decimals: 18 }));
        if (network.mezo && mezoDecimals !== null) {
          const mezoLogs = await readRecentTransfers({ rpc, token: network.mezo.address, owner: address, lookbackBlocks: LOOKBACK_BLOCKS });
          items.push(...mezoLogs.map((log) => ({ token: "MEZO" as const, log, decimals: mezoDecimals })));
        }
        items.sort((a, b) => b.log.blockNumber - a.log.blockNumber);
        if (!cancelled) setTransfers(items);
      } catch (err) {
        if (!cancelled) {
          setTransfers(null);
          setTransferError(err instanceof Error ? err.message : "Transfers could not be read.");
        }
      } finally {
        if (!cancelled) setLoadingTransfers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, address, network, mezoDecimals, tick]);

  const explorer = network.explorerUrl.replace(/\/?$/, "/");

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Activity"
        title="Your transactions"
        description="Outgoing transactions sent from this app, and incoming and outgoing MUSD or MEZO transfers read from the chain. Balances are not included here."
        actions={
          ready ? (
            <Button variant="ghost" onClick={() => setTick((t) => t + 1)} className="min-h-11 px-2">
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
            </Button>
          ) : undefined
        }
      />

      {!ready && (
        <Card>
          <p className="text-sm text-mist-400">
            {state.status !== "connected" ? "Connect a wallet to see its transactions." : `Switch your wallet to ${network.label} to see its transactions.`}
          </p>
        </Card>
      )}

      {ready && (
        <>
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-mist-500">Sent from MezoVault IQ</h2>
            <Card className="space-y-3">
              {mine.length === 0 ? (
                <p className="text-sm text-mist-400">No transactions have been sent from this app on {network.label} from this browser.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {mine.map((e) => (
                    <li key={e.hash} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm text-mist-100"><ArrowUpRight className="mr-1 inline h-4 w-4 text-gold-400" aria-hidden="true" />Sent {e.amount} {e.token} to {shortAddress(e.to)}</p>
                        <p className="text-xs text-mist-500">{formatTime(e.createdAt)} · {shortAddress(e.hash)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <DataStatus state={e.status === "success" ? "live" : e.status === "pending" || e.status === "unconfirmed" ? "unverified" : "unavailable"} detail={e.status === "success" ? `block ${e.blockNumber}` : e.status} />
                        <a href={`${explorer}tx/${e.hash}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-gold-300 hover:underline">
                          Explorer <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-mist-500">MUSD and MEZO transfers (last {LOOKBACK_BLOCKS} blocks)</h2>
            <Card className="space-y-3">
              {loadingTransfers && <p className="text-sm text-mist-400" role="status">Reading transfers from {network.label}…</p>}
              {!loadingTransfers && transferError && (
                <div className="space-y-2">
                  <DataStatus state="unavailable" />
                  <p className="text-sm text-mist-400">{transferError} The RPC may limit how far back it can search.</p>
                </div>
              )}
              {!loadingTransfers && !transferError && transfers && transfers.length === 0 && (
                <p className="text-sm text-mist-400">No MUSD or MEZO transfers involving this wallet in the last {LOOKBACK_BLOCKS} blocks.</p>
              )}
              {!loadingTransfers && !transferError && transfers && transfers.length > 0 && (
                <ul className="divide-y divide-line">
                  {transfers.map((t) => {
                    const amount = formatTokenUnits(t.log.valueRaw, t.decimals, Math.min(6, t.decimals));
                    const incoming = t.log.direction === "incoming";
                    const counterpart = incoming ? t.log.from : t.log.to;
                    return (
                      <li key={`${t.log.txHash}-${t.log.direction}-${t.token}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm text-mist-100">
                            {incoming ? <ArrowDownLeft className="mr-1 inline h-4 w-4 text-gold-400" aria-hidden="true" /> : <ArrowUpRight className="mr-1 inline h-4 w-4 text-gold-400" aria-hidden="true" />}
                            {incoming ? "Received" : "Sent"} {amount} {t.token} {incoming ? "from" : "to"} {shortAddress(counterpart)}
                          </p>
                          <p className="text-xs text-mist-500">Block {t.log.blockNumber} · {shortAddress(t.log.txHash)}</p>
                        </div>
                        <a href={`${explorer}tx/${t.log.txHash}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-gold-300 hover:underline">
                          Explorer <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </section>
        </>
      )}

      <Card className="space-y-3 text-sm leading-relaxed text-mist-400">
        <p className="font-medium text-mist-200">What this page does not show</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Incoming BTC. Native BTC transfers emit no events, so they cannot be read this way.</li>
          <li>Transactions sent from other apps or wallets, except MUSD and MEZO token transfers.</li>
          <li>Anything older than the {LOOKBACK_BLOCKS}-block window. Use the explorer for full history.</li>
          <li>Transaction timestamps for chain transfers, which show the block number instead.</li>
        </ul>
        <p className="text-xs text-mist-500">Sent-from-app records are stored only in this browser.</p>
      </Card>
    </div>
  );
}
