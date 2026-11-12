import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, ArrowDownLeft, ArrowUpRight, RefreshCw } from "lucide-react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { CoverageMap } from "../components/activity/CoverageMap";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DataStatus } from "../components/ui/DataStatus";
import { useWallet } from "../components/wallet/WalletProvider";
import { useMezoBalance } from "../hooks/useMezoBalance";
import { resolveRpcUrl } from "../config/env";
import { createRpcClient, type RpcClient } from "../lib/rpc";
import { readTransfersInRange, type TransferLog } from "../lib/transferLogs";
import { browserStore, entriesFor, readLedger, updateEntry, type LedgerEntry } from "../lib/txLedger";
import { formatTokenUnits } from "../lib/tokenAmount";
import { formatTime, shortAddress } from "../lib/format";
import { buildActivityCsv } from "../lib/activityCsv";
import type { MezoNetworkConfig } from "../config/chains";

/** Each explicit history request covers this many blocks; older pages are fetched only on demand. */
const PAGE_BLOCKS = 5_000;

interface ChainTransfer {
  token: "MUSD" | "MEZO";
  log: TransferLog;
  decimals: number;
}

interface TransferCoverage {
  fromBlock: number;
  toBlock: number;
  snapshotBlock: number;
  retrievedAt: string;
}

async function readTokenTransfers(options: {
  rpc: RpcClient;
  network: MezoNetworkConfig;
  owner: `0x${string}`;
  fromBlock: number;
  toBlock: number;
  mezoDecimals: number | null;
}): Promise<ChainTransfer[]> {
  const { rpc, network, owner, fromBlock, toBlock, mezoDecimals } = options;
  if (!network.musd) throw new Error(`MUSD is not configured for ${network.label}.`);

  const musdRequest = readTransfersInRange({
    rpc,
    token: network.musd.address,
    owner,
    fromBlock,
    toBlock,
  });
  const mezoRequest = network.mezo && mezoDecimals !== null
    ? readTransfersInRange({ rpc, token: network.mezo.address, owner, fromBlock, toBlock })
    : Promise.resolve([] as TransferLog[]);
  const [musdLogs, mezoLogs] = await Promise.all([musdRequest, mezoRequest]);
  return [
    ...musdLogs.map((log) => ({ token: "MUSD" as const, log, decimals: 18 })),
    ...mezoLogs.map((log) => ({ token: "MEZO" as const, log, decimals: mezoDecimals! })),
  ].sort((a, b) => b.log.blockNumber - a.log.blockNumber);
}

function blockNumberFromHex(value: string): number {
  if (!/^0x[0-9a-fA-F]+$/.test(value)) throw new Error("The RPC returned an invalid block number.");
  const block = BigInt(value);
  if (block > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("The RPC returned an unsafe block number.");
  return Number(block);
}

export function Activity() {
  const { state, network, isSupportedNetwork } = useWallet();
  const mezo = useMezoBalance();
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [transfers, setTransfers] = useState<ChainTransfer[] | null>(null);
  const [transferCoverage, setTransferCoverage] = useState<TransferCoverage | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [olderError, setOlderError] = useState<string | null>(null);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [tick, setTick] = useState(0);
  const historyGeneration = useRef(0);

  const address = state.address;
  const ready = state.status === "connected" && address !== null && isSupportedNetwork;
  const mezoDecimals = mezo.view.status === "done" && mezo.view.result.status === "ok" ? mezo.view.result.decimals : null;

  const mine = useMemo(
    () => (address ? entriesFor(ledger, address, network.chainId) : []),
    [ledger, address, network.chainId],
  );

  // Load the local ledger, then re-check any pending transactions against their receipts.
  useEffect(() => {
    if (!ready || !address) return;
    const store = browserStore();
    const rpc = createRpcClient({ url: resolveRpcUrl(network) });
    const pending = readLedger(store).filter(
      (entry) => entry.status === "pending" && entry.from.toLowerCase() === address.toLowerCase() && entry.chainId === network.chainId,
    );
    setLedger(readLedger(store));
    let cancelled = false;
    (async () => {
      for (const entry of pending) {
        try {
          const receipt = await rpc.call<{ status: string; blockNumber: string } | null>("eth_getTransactionReceipt", [entry.hash]);
          if (receipt) {
            updateEntry(store, entry.hash, {
              status: receipt.status === "0x1" ? "success" : "reverted",
              blockNumber: Number(BigInt(receipt.blockNumber)),
            });
          }
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

  // Read the latest page of standard ERC-20 Transfer logs, limited to verified token contracts.
  useEffect(() => {
    if (!ready || !address || !network.musd) return;
    const generation = ++historyGeneration.current;
    let cancelled = false;
    setLoadingTransfers(true);
    setLoadingOlder(false);
    setTransfers(null);
    setTransferCoverage(null);
    setTransferError(null);
    setOlderError(null);
    const rpc = createRpcClient({ url: resolveRpcUrl(network) });
    (async () => {
      try {
        const snapshotBlock = blockNumberFromHex(await rpc.call<string>("eth_blockNumber"));
        const fromBlock = Math.max(0, snapshotBlock - PAGE_BLOCKS + 1);
        const items = await readTokenTransfers({
          rpc,
          network,
          owner: address,
          fromBlock,
          toBlock: snapshotBlock,
          mezoDecimals,
        });
        if (!cancelled && generation === historyGeneration.current) {
          setTransfers(items);
          setTransferCoverage({ fromBlock, toBlock: snapshotBlock, snapshotBlock, retrievedAt: new Date().toISOString() });
        }
      } catch (err) {
        if (!cancelled && generation === historyGeneration.current) {
          setTransfers(null);
          setTransferError(err instanceof Error ? err.message : "Token transfer logs could not be read.");
        }
      } finally {
        if (!cancelled && generation === historyGeneration.current) setLoadingTransfers(false);
      }
    })();
    return () => {
      cancelled = true;
      if (historyGeneration.current === generation) historyGeneration.current += 1;
    };
  }, [ready, address, network, mezoDecimals, tick]);

  async function loadOlderTransfers() {
    if (!ready || !address || !network.musd || !transferCoverage || transferCoverage.fromBlock <= 0 || loadingOlder) return;
    const currentFromBlock = transferCoverage.fromBlock;
    const toBlock = currentFromBlock - 1;
    const fromBlock = Math.max(0, toBlock - PAGE_BLOCKS + 1);
    const generation = historyGeneration.current;
    const rpc = createRpcClient({ url: resolveRpcUrl(network) });
    setLoadingOlder(true);
    setOlderError(null);
    try {
      const older = await readTokenTransfers({ rpc, network, owner: address, fromBlock, toBlock, mezoDecimals });
      if (generation === historyGeneration.current) {
        setTransfers((current) => [...(current ?? []), ...older].sort((a, b) => b.log.blockNumber - a.log.blockNumber));
        setTransferCoverage((current) =>
          current && current.fromBlock === currentFromBlock ? { ...current, fromBlock, retrievedAt: new Date().toISOString() } : current,
        );
      }
    } catch (err) {
      if (generation === historyGeneration.current) {
        setOlderError(err instanceof Error ? err.message : "Older token transfer logs could not be read.");
      }
    } finally {
      if (generation === historyGeneration.current) setLoadingOlder(false);
    }
  }

  function exportLoadedTransfers() {
    if (!transfers || !transferCoverage) return;
    const csv = buildActivityCsv(transfers, transferCoverage);
    const file = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mezovault-iq-transfers-${transferCoverage.fromBlock}-${transferCoverage.toBlock}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const explorer = network.explorerUrl.replace(/\/?$/, "/");

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Activity"
        title="Your transactions"
        description="Outgoing transactions sent from this app, and MUSD or MEZO Transfer events read from the chain. Older token-log pages load on demand; these are not a complete wallet history."
        actions={
          ready ? (
            <Button variant="ghost" onClick={() => setTick((value) => value + 1)} className="min-h-11 px-2">
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
                  {mine.map((entry) => (
                    <li key={entry.hash} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm text-mist-100"><ArrowUpRight className="mr-1 inline h-4 w-4 text-gold-400" aria-hidden="true" />Sent {entry.amount} {entry.token} to {shortAddress(entry.to)}</p>
                        <p className="text-xs text-mist-500">{formatTime(entry.createdAt)} · {shortAddress(entry.hash)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <DataStatus state={entry.status === "success" ? "live" : entry.status === "pending" || entry.status === "unconfirmed" ? "unverified" : "unavailable"} detail={entry.status === "success" ? `block ${entry.blockNumber}` : entry.status} />
                        <a href={`${explorer}tx/${entry.hash}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-gold-300 hover:underline">
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
            <h2 className="text-xs font-semibold uppercase tracking-wider text-mist-500">MUSD and MEZO token transfers</h2>
            {!loadingTransfers && !transferError && transfers && transferCoverage && (
              <CoverageMap
                fromBlock={transferCoverage.fromBlock}
                toBlock={transferCoverage.toBlock}
                snapshotBlock={transferCoverage.snapshotBlock}
                tokens={mezoDecimals === null ? ["MUSD"] : ["MUSD", "MEZO"]}
                count={transfers.length}
              />
            )}
            <Card className="space-y-3">
              {loadingTransfers && <p className="text-sm text-mist-400" role="status">Reading the latest {PAGE_BLOCKS.toLocaleString()} blocks of token transfers from {network.label}…</p>}
              {!loadingTransfers && transferError && (
                <div className="space-y-2">
                  <DataStatus state="unavailable" />
                  <p className="text-sm text-mist-400">{transferError} The RPC may be unavailable or may limit log queries.</p>
                </div>
              )}
              {!loadingTransfers && !transferError && transfers && transfers.length === 0 && transferCoverage && (
                <p className="text-sm text-mist-400">No MUSD or MEZO transfer events in blocks {transferCoverage.fromBlock.toLocaleString()}–{transferCoverage.toBlock.toLocaleString()}.</p>
              )}
              {!loadingTransfers && !transferError && transfers && transfers.length > 0 && (
                <ul className="divide-y divide-line">
                  {transfers.map((transfer) => {
                    const amount = formatTokenUnits(transfer.log.valueRaw, transfer.decimals, Math.min(6, transfer.decimals));
                    const incoming = transfer.log.direction === "incoming";
                    const counterpart = incoming ? transfer.log.from : transfer.log.to;
                    return (
                      <li key={`${transfer.log.txHash}-${transfer.log.direction}-${transfer.token}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm text-mist-100">
                            {incoming ? <ArrowDownLeft className="mr-1 inline h-4 w-4 text-gold-400" aria-hidden="true" /> : <ArrowUpRight className="mr-1 inline h-4 w-4 text-gold-400" aria-hidden="true" />}
                            {incoming ? "Received" : "Sent"} {amount} {transfer.token} {incoming ? "from" : "to"} {shortAddress(counterpart)}
                          </p>
                          <p className="text-xs text-mist-500">Block {transfer.log.blockNumber} · {shortAddress(transfer.log.txHash)}</p>
                        </div>
                        <a href={`${explorer}tx/${transfer.log.txHash}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-gold-300 hover:underline">
                          Explorer <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}

              {!loadingTransfers && !transferError && transferCoverage && (
                <div className="space-y-3 border-t border-line pt-3">
                  <p className="text-xs leading-relaxed text-mist-500">
                    Loaded token-log range: blocks {transferCoverage.fromBlock.toLocaleString()}–{transferCoverage.toBlock.toLocaleString()} (snapshot at block {transferCoverage.snapshotBlock.toLocaleString()}). This covers only standard Transfer events for the configured MUSD and, when verified, MEZO contracts; it excludes native BTC transfers and other wallet or contract activity.
                  </p>
                  {olderError && <p className="text-sm text-risk-high">Could not load the older page: {olderError}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    {transferCoverage.fromBlock > 0 ? (
                      <Button variant="secondary" onClick={loadOlderTransfers} disabled={loadingOlder} className="min-h-11">
                        {loadingOlder ? "Loading older transfers…" : `Load older transfers (${Math.max(0, transferCoverage.fromBlock - PAGE_BLOCKS).toLocaleString()}–${(transferCoverage.fromBlock - 1).toLocaleString()})`}
                      </Button>
                    ) : (
                      <p className="text-xs text-mist-500">Reached block 0 for these token logs; this still is not a complete wallet history.</p>
                    )}
                    <Button variant="secondary" onClick={exportLoadedTransfers} className="min-h-11">
                      <Download className="h-4 w-4" aria-hidden="true" /> Export loaded rows CSV
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </section>
        </>
      )}

      <Card className="space-y-3 text-sm leading-relaxed text-mist-400">
        <p className="font-medium text-mist-200">What this page does not show</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Incoming or outgoing native BTC transfers, which are not ERC-20 Transfer events.</li>
          <li>Transactions sent from other apps or wallets, except MUSD and MEZO token Transfer events in the block ranges loaded above.</li>
          <li>Token transfers older than the pages you have loaded. Use “Load older transfers” to request another bounded range.</li>
          <li>Transaction timestamps for token log rows; they show block numbers instead.</li>
        </ul>
        <p className="text-xs text-mist-500">Transactions submitted from this app are stored only in this browser. The public explorer's usual address-history API routes were not available during integration checks, so this view does not claim comprehensive indexed history.</p>
      </Card>
    </div>
  );
}
