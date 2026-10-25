/**
 * Records transactions that this app submitted, so the Activity page can show them.
 * Stored in the browser only. It holds hashes and amounts, never keys or secrets.
 * It cannot record transactions sent from other apps.
 */
export type LedgerStatus = "pending" | "success" | "reverted" | "unconfirmed";

export interface LedgerEntry {
  hash: string;
  chainId: number;
  from: string;
  to: string;
  token: "BTC" | "MUSD" | "MEZO";
  amount: string;
  createdAt: string;
  status: LedgerStatus;
  blockNumber: number | null;
}

export interface LedgerStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = "mezovault.txledger.v1";
const MAX_ENTRIES = 200;

export function readLedger(store: LedgerStore): LedgerEntry[] {
  try {
    const raw = store.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as LedgerEntry[]) : [];
  } catch {
    return [];
  }
}

function write(store: LedgerStore, entries: LedgerEntry[]) {
  try {
    store.setItem(KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Storage may be full or disabled. The chain remains the source of truth.
  }
}

export function addEntry(store: LedgerStore, entry: LedgerEntry): void {
  const current = readLedger(store).filter((e) => e.hash.toLowerCase() !== entry.hash.toLowerCase());
  write(store, [...current, entry]);
}

export function updateEntry(
  store: LedgerStore,
  hash: string,
  patch: Partial<Pick<LedgerEntry, "status" | "blockNumber">>,
): void {
  write(
    store,
    readLedger(store).map((e) => (e.hash.toLowerCase() === hash.toLowerCase() ? { ...e, ...patch } : e)),
  );
}

/** Entries for one sender on one chain, newest first. */
export function entriesFor(entries: LedgerEntry[], from: string, chainId: number): LedgerEntry[] {
  return entries
    .filter((e) => e.from.toLowerCase() === from.toLowerCase() && e.chainId === chainId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Browser storage, or a no-op store when storage is unavailable. */
export function browserStore(): LedgerStore {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    // Access can throw in some privacy modes.
  }
  return { getItem: () => null, setItem: () => {} };
}
