import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MEZO_NETWORKS } from "../config/chains";
import { LOAN_SELECTORS } from "./loan";
import { MEZO_TESTNET_SELECTORS } from "./mezoAbi";
import { createRpcClient } from "./rpc";
import { fakeFetch, encodeUintResult, OWNER, type Handler } from "./testHelpers";
import {
  ADD_COLL_SELECTOR,
  encodeAddCollateralCalldata,
  prepareAddCollateral,
  sameAddCollateralReview,
} from "./addCollateralExecution";

const T = MEZO_NETWORKS.testnet;
const E18 = 10n ** 18n;
const NOW = new Date("2026-10-25T10:00:00.000Z");
const NOW_MS = NOW.getTime();
const NOW_SEC = Math.floor(NOW_MS / 1_000);
const BLOCK_TAG = "0x9";
const ORACLE = "0x7b7c000000000000000000000000000000000015";
const ZERO_WORD = "0".repeat(64);

function addressResult(address: string) {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

interface MockOptions {
  coll?: bigint;
  debt?: bigint;
  status?: bigint;
  chainId?: string;
  blockTimestamp?: number;
  emptyCodeAddress?: string;
  failSelector?: string;
  failEstimate?: boolean;
}

function handler(o: MockOptions = {}): Handler {
  return (method, params) => {
    if (method === "eth_chainId") return o.chainId ?? "0x7b7b";
    if (method === "eth_blockNumber") return BLOCK_TAG;
    if (method === "eth_getBlockByNumber") {
      assert.equal(params[0], BLOCK_TAG);
      return { number: BLOCK_TAG, timestamp: `0x${(o.blockTimestamp ?? NOW_SEC).toString(16)}` };
    }
    if (method === "eth_getCode") {
      assert.equal(params[1], BLOCK_TAG, "contract code must be checked at the position snapshot block");
      if (o.emptyCodeAddress?.toLowerCase() === String(params[0]).toLowerCase()) return "0x";
      return "0x60006000";
    }
    if (method === "eth_estimateGas") {
      const tx = params[0] as { from: string; to: string; data: string; value: string };
      assert.equal(params[1], BLOCK_TAG, "gas must be estimated at the position snapshot block");
      assert.equal(tx.to.toLowerCase(), T.borrowerOperations!.address.toLowerCase());
      assert.equal(tx.data, encodeAddCollateralCalldata());
      assert.ok(BigInt(tx.value) > 0n);
      if (o.failEstimate) return new Error("gas estimate reverted");
      return "0x5208";
    }
    if (method === "eth_call") {
      const tx = params[0] as { to: string; data: string; value?: string; gas?: string };
      assert.equal(params[1], BLOCK_TAG, "all calls must use the selected block");
      if (o.failSelector && tx.data.startsWith(o.failSelector)) return new Error("execution reverted");
      if (tx.data.startsWith(LOAN_SELECTORS.getTroveColl)) return encodeUintResult(o.coll ?? 2n * E18);
      if (tx.data.startsWith(LOAN_SELECTORS.getTroveDebt)) return encodeUintResult(o.debt ?? 1_800n * E18);
      if (tx.data.startsWith(LOAN_SELECTORS.getTroveStatus)) return encodeUintResult(o.status ?? 1n);
      if (tx.to.toLowerCase() === T.priceFeed!.address.toLowerCase()) {
        if (tx.data === LOAN_SELECTORS.fetchPrice) return encodeUintResult(100_000n * E18);
        if (tx.data === LOAN_SELECTORS.oracle) return addressResult(ORACLE);
      }
      if (tx.to.toLowerCase() === T.borrowerOperations!.address.toLowerCase() && tx.data === LOAN_SELECTORS.mcr) {
        return encodeUintResult(11n * E18 / 10n);
      }
      if (tx.to.toLowerCase() === ORACLE.toLowerCase()) {
        if (tx.data === LOAN_SELECTORS.decimals) return encodeUintResult(8n);
        if (tx.data === LOAN_SELECTORS.latestRoundData) {
          const w = (v: bigint) => v.toString(16).padStart(64, "0");
          return `0x${w(1n)}${w(7_729_815_740_000n)}${w(BigInt(NOW_SEC - 60))}${w(BigInt(NOW_SEC - 60))}${w(1n)}`;
        }
      }
      if (tx.to.toLowerCase() === T.borrowerOperations!.address.toLowerCase() && tx.data === encodeAddCollateralCalldata()) {
        assert.ok(tx.value && BigInt(tx.value) > 0n, "exact simulation includes a positive BTC native value");
        assert.ok(tx.gas, "exact simulation includes the buffered gas limit");
        return "0x";
      }
      return new Error(`unexpected eth_call ${tx.to} ${tx.data}`);
    }
    return new Error(`unexpected ${method}`);
  };
}

function run(o: MockOptions = {}) {
  const f = fakeFetch(handler(o));
  const rpc = createRpcClient({ url: T.rpcUrl, fetchImpl: f.fetchImpl });
  return { rpc, calls: f.calls };
}

const prepare = (rpc: ReturnType<typeof run>["rpc"], collateralBtc = "0.035") => prepareAddCollateral({
  account: OWNER,
  walletChainId: 31_611,
  collateralBtc,
  rpc,
  nowMs: NOW_MS,
});

describe("Mezo Testnet addColl execution preflight", () => {
  it("uses the artifact-verified payable selector, two zero hints, native BTC value, and a same-block active Trove", async () => {
    const { rpc, calls } = run();
    const result = await prepare(rpc);
    assert.equal(ADD_COLL_SELECTOR, "0x68647db1");
    assert.equal(result.transaction.to, T.borrowerOperations!.address);
    assert.equal(result.transaction.data, `${ADD_COLL_SELECTOR}${ZERO_WORD}${ZERO_WORD}`);
    assert.equal(result.transaction.value, `0x${(35n * 10n ** 15n).toString(16)}`);
    assert.equal(result.collateralWei, 35n * 10n ** 15n);
    assert.equal(result.existingCollateralWei, 2n * E18);
    assert.equal(result.existingDebtWei, 1_800n * E18);
    assert.equal(result.blockNumber, 9);
    assert.equal(result.gasEstimate, 21_000n);
    assert.equal(result.gasLimit, 25_200n);
    const contractCalls = calls.filter((call) => call.method === "eth_call");
    assert.ok(contractCalls.length > 0);
    assert.ok(contractCalls.every((call) => call.params[1] === BLOCK_TAG));
    assert.ok(calls.some((call) => call.method === "eth_estimateGas"));
    assert.ok(calls.some((call) => call.method === "eth_call" && (call.params[0] as { data: string }).data === result.transaction.data));
    assert.equal(calls.some((call) => call.method === "eth_sendTransaction"), false);
  });

  it("refuses a wallet without an active, non-empty Trove before gas estimation", async () => {
    for (const options of [{ status: 0n, coll: 0n, debt: 0n }, { status: 2n, coll: 0n, debt: 0n }]) {
      const { rpc, calls } = run(options);
      await assert.rejects(prepare(rpc), /no verified active Trove/);
      assert.equal(calls.some((call) => call.method === "eth_estimateGas"), false);
    }
  });

  it("fails closed on mismatched wallet chain, unknown status, and non-empty inactive state", async () => {
    const wrongChain = run();
    await assert.rejects(prepareAddCollateral({ account: OWNER, walletChainId: 31_612, collateralBtc: "0.035", rpc: wrongChain.rpc, nowMs: NOW_MS }), /not on Mezo Testnet/);
    assert.equal(wrongChain.calls.length, 0);

    await assert.rejects(prepare(run({ status: 5n }).rpc), /could not be verified/);
    await assert.rejects(prepare(run({ status: 2n, coll: E18 }).rpc), /could not be verified/);
    await assert.rejects(prepare(run({ status: 3n, debt: E18 }).rpc), /could not be verified/);
  });

  it("rejects zero, excess-precision, and overflowing amounts before any RPC call", async () => {
    for (const amount of ["0", "0.0000000000000000001", "1" + "0".repeat(60)]) {
      const { rpc, calls } = run();
      await assert.rejects(prepare(rpc, amount), /positive BTC amount/);
      assert.equal(calls.length, 0);
    }
  });

  it("requires deployed BorrowerOperations code at the pinned block", async () => {
    const { rpc } = run({ emptyCodeAddress: T.borrowerOperations!.address });
    await assert.rejects(prepare(rpc), /no valid contract code/);
  });

  it("rejects stale Trove state, collateral overflow, a failed estimate, and a reverting exact simulation", async () => {
    const stale = run({ blockTimestamp: NOW_SEC - 61 });
    await assert.rejects(prepare(stale.rpc), /stale or has an invalid timestamp/);

    const overflow = run({ coll: (1n << 256n) - 1n, debt: E18 });
    await assert.rejects(prepare(overflow.rpc, "1"), /overflow/);

    await assert.rejects(prepare(run({ failEstimate: true }).rpc), /gas estimate\/simulation failed/);
    await assert.rejects(prepare(run({ failSelector: ADD_COLL_SELECTOR }).rpc), /gas estimate\/simulation failed/);
  });

  it("requires the final review to retain the same borrower position, amount, call, and gas", async () => {
    const first = await prepare(run().rpc);
    const same = await prepare(run().rpc);
    const changedAmount = await prepare(run().rpc, "0.036");
    const changedPosition = await prepare(run({ coll: 3n * E18 }).rpc);
    assert.equal(sameAddCollateralReview(first, same), true);
    assert.equal(sameAddCollateralReview(first, changedAmount), false);
    assert.equal(sameAddCollateralReview(first, changedPosition), false);
  });

  it("confirms the active status, collateral, and debt reads are at one fresh block", async () => {
    const { rpc, calls } = run();
    const prepared = await prepare(rpc);
    const positionCalls = calls.filter((call) => call.method === "eth_call" && [
      LOAN_SELECTORS.getTroveStatus,
      LOAN_SELECTORS.getTroveColl,
      LOAN_SELECTORS.getTroveDebt,
    ].includes(String((call.params[0] as { data: string }).data.slice(0, 10))));
    assert.equal(positionCalls.length, 3);
    assert.ok(positionCalls.every((call) => call.params[1] === `0x${prepared.blockNumber.toString(16)}`));
    assert.equal(calls.some((call) => call.method === "eth_sendTransaction"), false);
  });
});
