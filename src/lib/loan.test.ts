import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readLoan, decodeRoundData, LOAN_SELECTORS } from "./loan";
import { createRpcClient } from "./rpc";
import { MEZO_NETWORKS } from "../config/chains";
import { fakeFetch, encodeUintResult, OWNER, type Handler } from "./testHelpers";

const T = MEZO_NETWORKS.testnet;
const E18 = 10n ** 18n;
const now = () => new Date("2026-10-25T10:00:00.000Z");
const NOW_SEC = Math.floor(now().getTime() / 1000);

/** latestRoundData response: roundId, answer, startedAt, updatedAt, answeredInRound. */
function roundData(answer: bigint, updatedAt: number) {
  const w = (v: bigint) => v.toString(16).padStart(64, "0");
  return `0x${w(1n)}${w(answer)}${w(BigInt(updatedAt))}${w(BigInt(updatedAt))}${w(1n)}`;
}

function handler(o: { coll?: bigint; debt?: bigint; price?: bigint; updatedAt?: number; chainId?: string; revert?: boolean } = {}): Handler {
  return (method, params) => {
    if (method === "eth_chainId") return o.chainId ?? "0x7b7b";
    if (method === "eth_blockNumber") return "0x9";
    if (method === "eth_call") {
      const { to, data } = params[0] as { to: string; data: string };
      if (o.revert) return new Error("execution reverted");
      if (data.startsWith(LOAN_SELECTORS.getTroveColl)) return encodeUintResult(o.coll ?? 0n);
      if (data.startsWith(LOAN_SELECTORS.getTroveDebt)) return encodeUintResult(o.debt ?? 0n);
      if (data === LOAN_SELECTORS.decimals) return encodeUintResult(8n);
      if (data === LOAN_SELECTORS.latestRoundData) return roundData(o.price ?? 10_000_000_000_000n, o.updatedAt ?? NOW_SEC - 60);
      void to;
    }
    return new Error(`unexpected ${method}`);
  };
}

function run(h: Handler, network = T) {
  const rpc = createRpcClient({ url: network.rpcUrl, fetchImpl: fakeFetch(h).fetchImpl });
  return readLoan({ network, owner: OWNER, rpc, now });
}

describe("function selectors", () => {
  it("match the Keccak-derived values", () => {
    assert.equal(LOAN_SELECTORS.getTroveColl, "0x480cd578");
    assert.equal(LOAN_SELECTORS.getTroveDebt, "0xd66a2553");
    assert.equal(LOAN_SELECTORS.latestRoundData, "0xfeaf968c");
  });
});

describe("loan position", () => {
  it("reports no active loan when collateral and debt are both zero", async () => {
    const r = await run(handler());
    assert.equal(r.status, "ok");
    if (r.status === "ok") {
      assert.equal(r.hasLoan, false);
      assert.equal(r.collateralRatioPct, null);
    }
  });

  it("formats collateral and debt from the contract's raw values", async () => {
    const r = await run(handler({ coll: 2n * E18, debt: 1000n * E18 }));
    assert.equal(r.status, "ok");
    if (r.status === "ok") {
      assert.equal(r.hasLoan, true);
      assert.equal(r.collateralBtc, "2");
      assert.equal(r.debtMusd, "1,000");
    }
  });

  it("computes the collateral ratio from the on-chain BTC/USD price", async () => {
    // 2 BTC at $100,000 is $200,000 of collateral against 1,000 MUSD debt: 20,000%.
    const r = await run(handler({ coll: 2n * E18, debt: 1000n * E18, price: 10_000_000_000_000n }));
    assert.equal(r.status, "ok");
    if (r.status === "ok") {
      assert.equal(r.btcUsd, 100000);
      assert.equal(r.collateralValueUsd, 200000);
      assert.equal(r.collateralRatioPct, 20000);
    }
  });

  it("leaves the ratio unknown when there is no debt", async () => {
    const r = await run(handler({ coll: 2n * E18, debt: 0n }));
    if (r.status === "ok") assert.equal(r.collateralRatioPct, null);
  });

  it("reports the price age so stale data is visible", async () => {
    const r = await run(handler({ coll: E18, debt: 1n * E18, updatedAt: NOW_SEC - 3600 }));
    if (r.status === "ok") assert.equal(r.priceAgeSeconds, 3600);
  });

  it("refuses to read on another network", async () => {
    assert.equal((await run(handler({ chainId: "0x7b7c" }))).status, "wrong-network");
  });

  it("reports not-configured when no TroveManager is verified", async () => {
    const r = await run(handler(), { ...T, troveManager: null });
    assert.equal(r.status, "not-configured");
  });

  it("returns an error, not a zero loan, when the contract call reverts", async () => {
    const r = await run(handler({ revert: true }));
    assert.equal(r.status, "error");
  });
});

describe("oracle decoding", () => {
  it("decodes the answer and update time", () => {
    const d = decodeRoundData(roundData(7_500_000_000_000n, 1_700_000_000));
    assert.equal(d.answer, 7_500_000_000_000n);
    assert.equal(d.updatedAt, 1_700_000_000);
  });

  it("rejects a negative price", () => {
    const negative = `0x${"0".repeat(64)}${"f".repeat(64)}${"0".repeat(128)}${"0".repeat(64)}`;
    assert.throws(() => decodeRoundData(negative), /negative/);
  });

  it("rejects a truncated response", () => {
    assert.throws(() => decodeRoundData("0x1234"));
  });
});
