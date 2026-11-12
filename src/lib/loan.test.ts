import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readLoan, decodeRoundData, LOAN_SELECTORS, isLoanPriceFresh, isLoanReadFresh } from "./loan";
import { createRpcClient } from "./rpc";
import { MEZO_NETWORKS } from "../config/chains";
import { fakeFetch, encodeUintResult, OWNER, type Handler } from "./testHelpers";

const T = MEZO_NETWORKS.testnet;
const E18 = 10n ** 18n;
const now = () => new Date("2026-10-25T10:00:00.000Z");
const NOW_SEC = Math.floor(now().getTime() / 1000);
const BLOCK_TAG = "0x9";
const ORACLE = "0x7b7c000000000000000000000000000000000015";

/** latestRoundData response: roundId, answer, startedAt, updatedAt, answeredInRound. */
function roundData(answer: bigint, updatedAt: number) {
  const w = (v: bigint) => v.toString(16).padStart(64, "0");
  return `0x${w(1n)}${w(answer)}${w(BigInt(updatedAt))}${w(BigInt(updatedAt))}${w(1n)}`;
}

function addressResult(address: string) {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

interface MockOptions {
  coll?: bigint;
  debt?: bigint;
  status?: bigint;
  price?: bigint;
  mcr?: bigint;
  updatedAt?: number;
  chainId?: string;
  failSelector?: string;
  blockHeaderNumber?: string;
  emptyCodeAddress?: string;
}

function handler(o: MockOptions = {}): Handler {
  return (method, params) => {
    if (method === "eth_chainId") return o.chainId ?? "0x7b7b";
    if (method === "eth_blockNumber") return BLOCK_TAG;
    if (method === "eth_getBlockByNumber") {
      assert.equal(params[0], BLOCK_TAG);
      return { number: o.blockHeaderNumber ?? BLOCK_TAG, timestamp: `0x${NOW_SEC.toString(16)}` };
    }
    if (method === "eth_getCode") {
      assert.equal(params[1], BLOCK_TAG);
      if (o.emptyCodeAddress?.toLowerCase() === String(params[0]).toLowerCase()) return "0x";
      return "0x60006000";
    }
    if (method === "eth_call") {
      const { to, data } = params[0] as { to: string; data: string };
      assert.equal(params[1], BLOCK_TAG, "all contract reads must use the selected block");
      if (o.failSelector && data.startsWith(o.failSelector)) return new Error("execution reverted");
      if (data.startsWith(LOAN_SELECTORS.getTroveColl)) return encodeUintResult(o.coll ?? 0n);
      if (data.startsWith(LOAN_SELECTORS.getTroveDebt)) return encodeUintResult(o.debt ?? 0n);
      if (data.startsWith(LOAN_SELECTORS.getTroveStatus)) {
        const defaultStatus = (o.coll ?? 0n) > 0n || (o.debt ?? 0n) > 0n ? 1n : 0n;
        return encodeUintResult(o.status ?? defaultStatus);
      }
      if (to.toLowerCase() === T.priceFeed?.address.toLowerCase()) {
        if (data === LOAN_SELECTORS.fetchPrice) return encodeUintResult(o.price ?? 100_000n * E18);
        if (data === LOAN_SELECTORS.oracle) return addressResult(ORACLE);
      }
      if (to.toLowerCase() === T.borrowerOperations?.address.toLowerCase() && data === LOAN_SELECTORS.mcr) {
        return encodeUintResult(o.mcr ?? 11n * E18 / 10n);
      }
      if (to.toLowerCase() === ORACLE.toLowerCase()) {
        if (data === LOAN_SELECTORS.decimals) return encodeUintResult(8n);
        if (data === LOAN_SELECTORS.latestRoundData) return roundData(7_729_815_740_000n, o.updatedAt ?? NOW_SEC - 60);
      }
      return new Error(`unexpected eth_call ${to} ${data}`);
    }
    return new Error(`unexpected ${method}`);
  };
}

function run(o: MockOptions = {}, network = T) {
  const f = fakeFetch(handler(o));
  const rpc = createRpcClient({ url: network.rpcUrl, fetchImpl: f.fetchImpl });
  return { result: readLoan({ network, owner: OWNER, rpc, now }), calls: f.calls };
}

describe("function selectors", () => {
  it("match the Keccak-derived values", () => {
    assert.equal(LOAN_SELECTORS.getTroveColl, "0x480cd578");
    assert.equal(LOAN_SELECTORS.getTroveDebt, "0xd66a2553");
    assert.equal(LOAN_SELECTORS.getTroveStatus, "0x21e37801");
    assert.equal(LOAN_SELECTORS.fetchPrice, "0x0fdb11cf");
    assert.equal(LOAN_SELECTORS.oracle, "0x7dc0d1d0");
    assert.equal(LOAN_SELECTORS.latestRoundData, "0xfeaf968c");
    assert.equal(LOAN_SELECTORS.mcr, "0x794e5724");
  });
});

describe("loan position", () => {
  it("reports no active loan from an all-zero recognized inactive status without calling oracle or MCR", async () => {
    const { result, calls } = run();
    const r = await result;
    assert.equal(r.status, "ok");
    if (r.status === "ok") {
      assert.equal(r.hasLoan, false);
      assert.equal(r.collateralRaw, 0n);
      assert.equal(r.debtRaw, 0n);
      assert.equal(r.btcUsdWei, null);
      assert.equal(r.mcrWei, null);
      assert.equal(r.riskInputsError, null);
    }
    assert.equal(calls.some((entry) => entry.method === "eth_call" && [LOAN_SELECTORS.fetchPrice, LOAN_SELECTORS.mcr].includes(String((entry.params[0] as { data: string }).data))), false);
    assert.equal(calls.some((entry) => entry.method === "eth_getCode" && String(entry.params[0]).toLowerCase() === T.priceFeed?.address.toLowerCase()), false);
  });

  it("accepts only the known zero-collateral inactive statuses as no active Trove", async () => {
    for (const status of [0n, 2n, 3n, 4n]) {
      const r = await run({ status }).result;
      assert.equal(r.status, "ok");
      if (r.status === "ok") assert.equal(r.hasLoan, false);
    }
  });

  it("uses one pinned block for all Trove, price, oracle, and MCR reads", async () => {
    const { result, calls } = run({ coll: 2n * E18, debt: 1000n * E18 });
    const r = await result;
    assert.equal(r.status, "ok");
    if (r.status === "ok") {
      assert.equal(r.hasLoan, true);
      assert.equal(r.blockNumber, 9);
      assert.equal(r.blockTimestamp, NOW_SEC);
      assert.equal(r.collateralBtc, "2");
      assert.equal(r.debtMusd, "1,000");
      assert.equal(r.btcUsdWei, 100_000n * E18);
      assert.equal(r.mcrWei, 11n * E18 / 10n);
      assert.equal(r.priceAgeSeconds, 60);
    }
    const callsAtAnyBlock = calls.filter((entry) => entry.method === "eth_call");
    assert.ok(callsAtAnyBlock.length >= 8);
    assert.ok(callsAtAnyBlock.every((entry) => entry.params[1] === BLOCK_TAG));
    const codeReads = calls.filter((entry) => entry.method === "eth_getCode");
    assert.equal(codeReads.length, 4);
    assert.ok(codeReads.every((entry) => entry.params[1] === BLOCK_TAG));
  });

  it("never turns an unknown or non-empty inactive Trove into a no-loan result", async () => {
    assert.equal((await run({ status: 5n }).result).status, "error");
    assert.equal((await run({ status: 2n, coll: E18 }).result).status, "error");
    assert.equal((await run({ status: 3n, debt: E18 }).result).status, "error");
  });

  it("does not claim an active Trove when its active status has zero collateral or debt", async () => {
    assert.equal((await run({ status: 1n, coll: E18, debt: 0n }).result).status, "error");
    assert.equal((await run({ status: 1n, coll: 0n, debt: E18 }).result).status, "error");
  });

  it("retains the position but withholds risk inputs when oracle or MCR reads fail", async () => {
    const oracleFailure = await run({ coll: E18, debt: 1_000n * E18, failSelector: LOAN_SELECTORS.fetchPrice }).result;
    assert.equal(oracleFailure.status, "ok");
    if (oracleFailure.status === "ok") {
      assert.equal(oracleFailure.hasLoan, true);
      assert.equal(oracleFailure.btcUsdWei, null);
      assert.equal(oracleFailure.mcrWei, 11n * E18 / 10n);
      assert.match(oracleFailure.riskInputsError ?? "", /could not be reached/);
    }

    const mcrFailure = await run({ coll: E18, debt: 1_000n * E18, failSelector: LOAN_SELECTORS.mcr }).result;
    assert.equal(mcrFailure.status, "ok");
    if (mcrFailure.status === "ok") {
      assert.equal(mcrFailure.btcUsdWei, 100_000n * E18);
      assert.equal(mcrFailure.mcrWei, null);
      assert.match(mcrFailure.riskInputsError ?? "", /could not be reached/);
    }
  });

  it("reports stale oracle freshness and rejects a future oracle update", async () => {
    const stale = await run({ coll: E18, debt: 1_000n * E18, updatedAt: NOW_SEC - 3_601 }).result;
    assert.equal(stale.status, "ok");
    if (stale.status === "ok") {
      assert.equal(stale.priceAgeSeconds, 3_601);
      assert.equal(isLoanPriceFresh(stale, now().getTime()), false);
    }
    const future = await run({ coll: E18, debt: 1_000n * E18, updatedAt: NOW_SEC + 1 }).result;
    assert.equal(future.status, "ok");
    if (future.status === "ok") {
      assert.equal(future.btcUsdWei, null);
      assert.match(future.riskInputsError ?? "", /newer than the snapshot/);
    }
  });

  it("checks result freshness against its retrieval time", async () => {
    const r = await run({ coll: E18, debt: E18 }).result;
    assert.equal(r.status, "ok");
    if (r.status === "ok") {
      assert.equal(isLoanReadFresh(r, now().getTime()), true);
      assert.equal(isLoanReadFresh(r, now().getTime() + 60_001), false);
    }
  });

  it("rejects inconsistent snapshot headers", async () => {
    assert.equal((await run({ blockHeaderNumber: "0xa" }).result).status, "error");
  });

  it("requires TroveManager code at the snapshot block", async () => {
    const r = await run({ emptyCodeAddress: T.troveManager!.address }).result;
    assert.equal(r.status, "error");
    if (r.status === "error") assert.match(r.message, /no contract code/);
  });

  it("refuses to read on another network before any contract call", async () => {
    const { result, calls } = run({ chainId: "0x7b7c" });
    assert.equal((await result).status, "wrong-network");
    assert.equal(calls.some((entry) => entry.method === "eth_call" || entry.method === "eth_getCode"), false);
  });

  it("reports not-configured when no TroveManager is verified", async () => {
    const r = await run({}, { ...T, troveManager: null }).result;
    assert.equal(r.status, "not-configured");
  });

  it("returns an error, not a zero loan, when a required position call reverts", async () => {
    const r = await run({ failSelector: LOAN_SELECTORS.getTroveColl }).result;
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
