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
import { isActivityContextCurrent, receiptMatchesRequestedHash, withVerifiedActivityChain } from "../lib/activityRpc";
import { readTransfersInRange, type TransferLog } from "../lib/transferLogs";
import { browserStore, entriesFor, parseLedgerReceipt, readLedger, updateEntry, type LedgerEntry } from "../lib/txLedger";
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
  const [historyContextKey, setHistoryContextKey] = useState<string | null>(null);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [tick, setTick] = useState(0);
  const historyGeneration = useRef(0);

  const address = state.address;
  const ready = state.status === "connected" && address !== null && isSupportedNetwork;
  const activityContextKey = ready && address && network.musd ? `${network.chainId}:${address.toLowerCase()}` : null;
  const historyContextMatches = isActivityContextCurrent(historyContextKey, activityContextKey);
  const visibleTransfers = historyContextMatches ? transfers : null;
  const visibleTransferCoverage = historyContextMatches ? transferCoverage : null;
  const visibleTransferError = historyContextMatches ? transferError : null;
  const visibleOlderError = historyContextMatches ? olderError : null;
  const visibleLoadingTransfers = !historyContextMatches || loadingTransfers;
  const visibleLoadingOlder = historyContextMatches && loadingOlder;
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
          if (cancelled) return;
          const receipt = await withVerifiedActivityChain(rpc, network.chainId, () =>
            rpc.call<unknown>("eth_getTransactionReceipt", [entry.hash]),
          );
          if (!cancelled && receipt && receiptMatchesRequestedHash(receipt, entry.hash)) {
            const parsed = parseLedgerReceipt(receipt);
            if (parsed) updateEntry(store, entry.hash, parsed);
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
    const contextKey = `${network.chainId}:${address.toLowerCase()}`;
    const generation = ++historyGeneration.current;
    let cancelled = false;
    setHistoryContextKey(contextKey);
    setLoadingTransfers(true);
    setLoadingOlder(false);
    setTransfers(null);
    setTransferCoverage(null);
    setTransferError(null);
    setOlderError(null);
    const rpc = createRpcClient({ url: resolveRpcUrl(network) });
    (async () => {
      try {
        const { snapshotBlock, fromBlock, items } = await withVerifiedActivityChain(rpc, network.chainId, async () => {
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
          return { snapshotBlock, fromBlock, items };
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
    const contextKey = `${network.chainId}:${address.toLowerCase()}`;
    const rpc = createRpcClient({ url: resolveRpcUrl(network) });
    setLoadingOlder(true);
    setOlderError(null);
    try {
      const older = await withVerifiedActivityChain(rpc, network.chainId, () =>
        readTokenTransfers({ rpc, network, owner: address, fromBlock, toBlock, mezoDecimals }),
      );
      if (generation === historyGeneration.current && contextKey === `${network.chainId}:${address.toLowerCase()}`) {
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
    if (!visibleTransfers || !visibleTransferCoverage) return;
    const csv = buildActivityCsv(visibleTransfers, visibleTransferCoverage);
    const file = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mezovault-iq-transfers-${visibleTransferCoverage.fromBlock}-${visibleTransferCoverage.toBlock}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const explorer = network.explorerUrl.replace(/\/?$/, "/");

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Activity"
        title="Activity"
        description="App-submitted hashes and loaded MUSD/MEZO transfer logs."
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
            <h2 className="text-xs font-semibold uppercase tracking-wider text-mist-500">Submitted by this app</h2>
            <Card className="space-y-3">
              <p className="text-xs leading-relaxed text-mist-500">Up to 200 hashes are stored in this browser. Success means execution in the displayed block; finality is not checked.</p>
              {mine.length === 0 ? (
                <p className="text-sm text-mist-400">No transactions have been sent from this app on {network.label} from this browser.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {mine.map((entry) => (
                    <li key={entry.hash} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm text-mist-100"><ArrowUpRight className="mr-1 inline h-4 w-4 text-gold-400" aria-hidden="true" />{entry.action ?? `Sent ${entry.amount} ${entry.token} to ${shortAddress(entry.to)}`}</p>
                        {entry.action && <p className="text-xs text-mist-500">{entry.amount} {entry.token} · target {shortAddress(entry.to)}</p>}
                        <p className="text-xs text-mist-500">{formatTime(entry.createdAt)} · {shortAddress(entry.hash)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <DataStatus state={entry.status === "success" ? "live" : entry.status === "pending" || entry.status === "unconfirmed" ? "unverified" : "unavailable"} detail={entry.status === "success" ? `execution succeeded · block ${entry.blockNumber}` : entry.status} />
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
            {!visibleLoadingTransfers && !visibleTransferError && visibleTransfers && visibleTransferCoverage && (
              <CoverageMap
                fromBlock={visibleTransferCoverage.fromBlock}
                toBlock={visibleTransferCoverage.toBlock}
                snapshotBlock={visibleTransferCoverage.snapshotBlock}
                tokens={mezoDecimals === null ? ["MUSD"] : ["MUSD", "MEZO"]}
                count={visibleTransfers.length}
              />
            )}
            <Card className="space-y-3">
              {visibleLoadingTransfers && <p className="text-sm text-mist-400" role="status">Reading the latest {PAGE_BLOCKS.toLocaleString()} blocks of token transfers from {network.label}…</p>}
              {!visibleLoadingTransfers && visibleTransferError && (
                <div className="space-y-2">
                  <DataStatus state="unavailable" />
                  <p className="text-sm text-mist-400">Could not read token transfers: {visibleTransferError}</p>
                </div>
              )}
              {!visibleLoadingTransfers && !visibleTransferError && visibleTransfers && visibleTransfers.length === 0 && visibleTransferCoverage && (
                <p className="text-sm text-mist-400">No MUSD or MEZO transfer events in blocks {visibleTransferCoverage.fromBlock.toLocaleString()}–{visibleTransferCoverage.toBlock.toLocaleString()}.</p>
              )}
              {!visibleLoadingTransfers && !visibleTransferError && visibleTransfers && visibleTransfers.length > 0 && (
                <ul className="divide-y divide-line">
                  {visibleTransfers.map((transfer) => {
                    const amount = formatTokenUnits(transfer.log.valueRaw, transfer.decimals, Math.min(6, transfer.decimals));
                    const incoming = transfer.log.direction === "incoming";
                    const self = transfer.log.direction === "self";
                    const counterpart = incoming ? transfer.log.from : transfer.log.to;
                    return (
                      <li key={`${transfer.log.txHash}-${transfer.log.logIndex}-${transfer.token}`} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm text-mist-100">
                            {self ? null : incoming ? <ArrowDownLeft className="mr-1 inline h-4 w-4 text-gold-400" aria-hidden="true" /> : <ArrowUpRight className="mr-1 inline h-4 w-4 text-gold-400" aria-hidden="true" />}
                            {self ? `Self-transfer ${amount} ${transfer.token}` : `${incoming ? "Received" : "Sent"} ${amount} ${transfer.token} ${incoming ? "from" : "to"} ${shortAddress(counterpart)}`}
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

              {!visibleLoadingTransfers && !visibleTransferError && visibleTransferCoverage && (
                <div className="space-y-3 border-t border-line pt-3">
                  <p className="text-xs leading-relaxed text-mist-500">
                    Blocks {visibleTransferCoverage.fromBlock.toLocaleString()}–{visibleTransferCoverage.toBlock.toLocaleString()} · snapshot {visibleTransferCoverage.snapshotBlock.toLocaleString()}.
                  </p>
                  {visibleOlderError && <p className="text-sm text-risk-high">Could not load the older page: {visibleOlderError}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    {visibleTransferCoverage.fromBlock > 0 ? (
                      <Button variant="secondary" onClick={loadOlderTransfers} disabled={visibleLoadingOlder} className="min-h-11">
                        {visibleLoadingOlder ? "Loading older transfers…" : `Load older transfers (${Math.max(0, visibleTransferCoverage.fromBlock - PAGE_BLOCKS).toLocaleString()}–${(visibleTransferCoverage.fromBlock - 1).toLocaleString()})`}
                      </Button>
                    ) : (
                      <p className="text-xs text-mist-500">Reached block 0 for these token logs.</p>
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

      <p className="text-xs leading-relaxed text-mist-500">No native BTC or complete wallet history. CSV exports loaded MUSD/MEZO log rows only.</p>
    </div>
  );
}
