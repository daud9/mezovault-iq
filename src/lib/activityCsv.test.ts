import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildActivityCsv } from "./activityCsv";

const coverage = { fromBlock: 100, toBlock: 200, snapshotBlock: 200, retrievedAt: "2026-11-12T11:00:00.000Z" };

describe("bounded Activity CSV export", () => {
  it("exports only the supplied transfer rows and the exact coverage range", () => {
    const csv = buildActivityCsv([{
      token: "MUSD",
      decimals: 18,
      log: {
        txHash: "0xabc",
        blockNumber: 180,
        from: "0x1111111111111111111111111111111111111111",
        to: "0x2222222222222222222222222222222222222222",
        valueRaw: 1_250_000_000_000_000_000n,
        direction: "incoming",
      },
    }], coverage);
    const lines = csv.trimEnd().split("\r\n");
    assert.equal(lines.length, 2);
    assert.match(lines[0], /coverage_from_block/);
    assert.match(lines[1], /"MUSD","incoming","180","0xabc"/);
    assert.match(lines[1], /"1.25","1250000000000000000","18","100","200","200"/);
    assert.match(lines[1], /"2026-11-12T11:00:00.000Z"/);
  });

  it("can export a successfully scanned empty range without inventing rows", () => {
    const csv = buildActivityCsv([], coverage);
    assert.equal(csv.trimEnd().split("\r\n").length, 1);
    assert.match(csv, /transaction_hash/);
  });

  it("escapes quoted values and neutralizes spreadsheet formulas", () => {
    const csv = buildActivityCsv([{
      token: "MEZO",
      decimals: 18,
      log: {
        txHash: '=HYPERLINK("https://bad.example")',
        blockNumber: 199,
        from: "0x1111111111111111111111111111111111111111",
        to: "0x2222222222222222222222222222222222222222",
        valueRaw: 0n,
        direction: "outgoing",
      },
    }], coverage);
    assert.match(csv, /"'=HYPERLINK\(""https:\/\/bad\.example""\)"/);
  });
});
