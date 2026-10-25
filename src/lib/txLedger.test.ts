import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addEntry, updateEntry, readLedger, entriesFor, type LedgerEntry, type LedgerStore } from "./txLedger";

function memoryStore(initial: string | null = null): LedgerStore & { raw: () => string | null } {
  let value = initial;
  return { getItem: () => value, setItem: (_k, v) => { value = v; }, raw: () => value };
}

const FROM = "0x1111111111111111111111111111111111111111";
const OTHER = "0x3333333333333333333333333333333333333333";
const entry = (hash: string, over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  hash,
  chainId: 31611,
  from: FROM,
  to: OTHER,
  token: "BTC",
  amount: "0.001",
  createdAt: "2026-10-25T10:00:00.000Z",
  status: "pending",
  blockNumber: null,
  ...over,
});

describe("transaction ledger", () => {
  it("records a submitted transaction as pending", () => {
    const s = memoryStore();
    addEntry(s, entry("0xaa"));
    assert.equal(readLedger(s).length, 1);
    assert.equal(readLedger(s)[0].status, "pending");
  });

  it("updates status from a receipt without duplicating the entry", () => {
    const s = memoryStore();
    addEntry(s, entry("0xaa"));
    updateEntry(s, "0xAA", { status: "success", blockNumber: 42 });
    const all = readLedger(s);
    assert.equal(all.length, 1);
    assert.equal(all[0].status, "success");
    assert.equal(all[0].blockNumber, 42);
  });

  it("adding the same hash twice keeps one entry", () => {
    const s = memoryStore();
    addEntry(s, entry("0xaa"));
    addEntry(s, entry("0xaa"));
    assert.equal(readLedger(s).length, 1);
  });

  it("shows only one sender on one chain, newest first", () => {
    const all = [
      entry("0x1", { createdAt: "2026-10-25T10:00:00.000Z" }),
      entry("0x2", { createdAt: "2026-10-25T11:00:00.000Z" }),
      entry("0x3", { from: OTHER }),
      entry("0x4", { chainId: 1 }),
    ];
    const mine = entriesFor(all, FROM, 31611);
    assert.deepEqual(mine.map((e) => e.hash), ["0x2", "0x1"]);
  });

  it("returns nothing for corrupt storage instead of throwing", () => {
    assert.deepEqual(readLedger(memoryStore("{not json")), []);
    assert.deepEqual(readLedger(memoryStore('{"a":1}')), []);
  });

  it("keeps the newest entries when storage holds more than the limit", () => {
    const s = memoryStore();
    for (let i = 0; i < 205; i++) addEntry(s, entry(`0x${i.toString(16).padStart(4, "0")}`));
    const all = readLedger(s);
    assert.equal(all.length, 200);
    assert.equal(all[all.length - 1].hash, `0x${(204).toString(16).padStart(4, "0")}`);
  });
});
