import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MEZO_NETWORKS } from "../config/chains";
import { MEZO_TESTNET_SELECTORS as S } from "./mezoAbi";
import { encodeUintResult, fakeFetch, type Handler } from "./testHelpers";
import { createRpcClient } from "./rpc";
import {
  APPROVED_OPEN_TROVE_TEST,
  OpenTrovePreflightError,
  prepareApprovedOpenTrove,
} from "./openTroveExecution";
import { OPEN_TROVE_SELECTOR, WAD } from "./openTrovePlanner";

const NETWORK = MEZO_NETWORKS.testnet;
const ACCOUNT = APPROVED_OPEN_TROVE_TEST.account;
const NOW_SECONDS = Math.floor(Date.parse("2026-11-12T08:00:00.000Z") / 1_000);
const NOW_MS = NOW_SECONDS * 1_000;
const BLOCK_TAG = "0x100";
const GOVERNABLE = "0x3333333333333333333333333333333333333333";
const ORACLE = "0x7b7c000000000000000000000000000000000015";

function word(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function addressResult(address: string): string {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function roundData(answer: bigint, updatedAt: number): string {
  return `0x${word(1n)}${word(answer)}${word(BigInt(updatedAt))}${word(BigInt(updatedAt))}${word(1n)}`;
}

interface MockOptions {
  activeTrove?: boolean;
  minNetDebtWei?: bigint;
  oracleAgeSeconds?: number;
  failEstimate?: boolean;
  failOpenCall?: boolean;
}

function handler(options: MockOptions = {}): Handler {
  return (method, params) => {
    if (method === "eth_chainId") return "0x7b7b";
    if (method === "eth_blockNumber") return BLOCK_TAG;
    if (method === "eth_getBlockByNumber") {
      assert.equal(params[0], BLOCK_TAG);
      return { number: BLOCK_TAG, timestamp: `0x${NOW_SECONDS.toString(16)}` };
    }
    if (method === "eth_getCode") {
      assert.equal(params[1], BLOCK_TAG);
      return "0x60006000";
    }
    if (method === "eth_estimateGas") {
      assert.equal(params[1], BLOCK_TAG);
      const tx = params[0] as { from: string; to: string; data: string; value: string };
      assert.equal(tx.from.toLowerCase(), ACCOUNT.toLowerCase());
      assert.equal(tx.to.toLowerCase(), NETWORK.borrowerOperations!.address.toLowerCase());
      assert.match(tx.data, new RegExp(`^${OPEN_TROVE_SELECTOR}`));
      assert.equal(tx.value, `0x${APPROVED_OPEN_TROVE_TEST.collateralWei.toString(16)}`);
      if (options.failEstimate) return new Error("estimate reverted");
      return `0x${BigInt(8_032_123).toString(16)}`;
    }
    if (method === "eth_call") {
      const call = params[0] as { to: string; data: string; from?: string; value?: string; gas?: string };
      const to = call.to.toLowerCase();
      const data = call.data.toLowerCase();
      assert.equal(params[1], BLOCK_TAG);
      if (to === NETWORK.borrowerOperations!.address.toLowerCase() && data.startsWith(S.borrowerOperations.openTrove)) {
        assert.equal(call.from?.toLowerCase(), ACCOUNT.toLowerCase());
        assert.equal(call.value, `0x${APPROVED_OPEN_TROVE_TEST.collateralWei.toString(16)}`);
        assert.ok(call.gas);
        if (options.failOpenCall) return new Error("execution reverted");
        return "0x";
      }
      if (to === NETWORK.priceFeed!.address.toLowerCase()) {
        if (data === S.priceFeed.fetchPrice) return encodeUintResult(80_000n * WAD);
        if (data === S.priceFeed.oracle) return addressResult(ORACLE);
      }
      if (to === NETWORK.borrowerOperations!.address.toLowerCase()) {
        if (data === S.borrowerOperations.minNetDebt) return encodeUintResult(options.minNetDebtWei ?? 1_800n * WAD);
        if (data === S.borrowerOperations.borrowingRate) return encodeUintResult(10n ** 15n);
        if (data === S.borrowerOperations.gasCompensation) return encodeUintResult(200n * WAD);
        if (data === S.borrowerOperations.mcr) return encodeUintResult(11n * WAD / 10n);
        if (data === S.borrowerOperations.ccr) return encodeUintResult(15n * WAD / 10n);
        if (data === S.borrowerOperations.getEntireSystemColl) return encodeUintResult(100n * WAD);
        if (data === S.borrowerOperations.getEntireSystemDebt) return encodeUintResult(1_000_000n * WAD);
        if (data === S.borrowerOperations.governableVariables) return addressResult(GOVERNABLE);
      }
      if (to === GOVERNABLE.toLowerCase() && data === `${S.governableVariables.feeExemptAccounts}${ACCOUNT.slice(2).toLowerCase().padStart(64, "0")}`) {
        return encodeUintResult(0n);
      }
      if (to === ORACLE.toLowerCase()) {
        if (data === S.priceOracleCaller.decimals) return encodeUintResult(8n);
        if (data === S.priceOracleCaller.latestRoundData) {
          const age = options.oracleAgeSeconds ?? 60;
          return roundData(8_000_000_000_000n, NOW_SECONDS - age);
        }
      }
      if (to === NETWORK.troveManager!.address.toLowerCase()) {
        if (data === `${S.troveManager.getTroveStatus}${ACCOUNT.slice(2).toLowerCase().padStart(64, "0")}`) {
          return encodeUintResult(options.activeTrove ? 1n : 0n);
        }
        if (data === `${S.troveManager.getTroveColl}${ACCOUNT.slice(2).toLowerCase().padStart(64, "0")}`) return encodeUintResult(0n);
        if (data === `${S.troveManager.getTroveDebt}${ACCOUNT.slice(2).toLowerCase().padStart(64, "0")}`) return encodeUintResult(0n);
        if (data.startsWith(S.troveManager.checkRecoveryMode)) return encodeUintResult(0n);
      }
      return new Error(`unexpected eth_call ${to} ${data}`);
    }
    return new Error(`unexpected RPC method ${method}`);
  };
}

function run(options: MockOptions = {}) {
  const mock = fakeFetch(handler(options));
  const rpc = createRpcClient({ url: NETWORK.rpcUrl, fetchImpl: mock.fetchImpl });
  return {
    calls: mock.calls,
    prepared: prepareApprovedOpenTrove({ account: ACCOUNT, walletChainId: NETWORK.chainId, rpc, nowMs: NOW_MS }),
  };
}

describe("approved one-test open-trove preflight", () => {
  it("prepares only the exact approved transaction after same-block checks and simulations", async () => {
    const { prepared, calls } = run();
    const result = await prepared;
    const expectedData = `${OPEN_TROVE_SELECTOR}${APPROVED_OPEN_TROVE_TEST.debtWei.toString(16).padStart(64, "0")}${"0".repeat(128)}`;
    assert.deepEqual(result.transaction, {
      from: ACCOUNT,
      to: "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5",
      data: expectedData,
      value: "0xb1a2bc2ec50000",
      gas: `0x${BigInt(8_032_123).toString(16)}`,
    });
    assert.equal(result.snapshot.blockNumber, 256);
    assert.equal(result.plan.status, "calculated");
    assert.equal(result.plan.allowed, true);
    const pinnedCalls = calls.filter((call) => call.method === "eth_call" || call.method === "eth_estimateGas");
    assert.ok(pinnedCalls.length > 0);
    assert.ok(pinnedCalls.every((call) => call.params[1] === BLOCK_TAG));
    assert.ok(calls.some((call) => call.method === "eth_estimateGas"));
    assert.ok(calls.some((call) => call.method === "eth_call" && (call.params[0] as { data?: string }).data?.startsWith(OPEN_TROVE_SELECTOR)));
    assert.equal(calls.some((call) => call.method === "eth_sendTransaction"), false);
  });

  it("blocks an account or chain mismatch before any RPC work", async () => {
    const other = fakeFetch(handler());
    const rpc = createRpcClient({ url: NETWORK.rpcUrl, fetchImpl: other.fetchImpl });
    await assert.rejects(
      prepareApprovedOpenTrove({ account: "0x1111111111111111111111111111111111111111", walletChainId: 31611, rpc, nowMs: NOW_MS }),
      (error: unknown) => error instanceof OpenTrovePreflightError && /does not match/.test(error.message),
    );
    await assert.rejects(
      prepareApprovedOpenTrove({ account: ACCOUNT, walletChainId: 1, rpc, nowMs: NOW_MS }),
      (error: unknown) => error instanceof OpenTrovePreflightError && /not on Mezo Testnet/.test(error.message),
    );
    assert.equal(other.calls.length, 0);
  });

  it("blocks when this wallet already has an active trove before estimating or simulating the open call", async () => {
    const { prepared, calls } = run({ activeTrove: true });
    await assert.rejects(prepared, (error: unknown) => error instanceof OpenTrovePreflightError && /already has an active/.test(error.message));
    assert.equal(calls.some((call) => call.method === "eth_estimateGas"), false);
    assert.equal(calls.some((call) => call.method === "eth_call" && (call.params[0] as { data?: string }).data?.startsWith(OPEN_TROVE_SELECTOR)), false);
  });

  it("blocks when the fresh protocol plan no longer passes", async () => {
    const { prepared, calls } = run({ minNetDebtWei: 4_000n * WAD });
    await assert.rejects(prepared, (error: unknown) => error instanceof OpenTrovePreflightError && /checks do not pass/.test(error.message));
    assert.equal(calls.some((call) => call.method === "eth_estimateGas"), false);
  });

  it("blocks stale oracle data and never reaches wallet submission", async () => {
    const { prepared, calls } = run({ oracleAgeSeconds: 3_601 });
    await assert.rejects(prepared, (error: unknown) => error instanceof OpenTrovePreflightError && /could not be verified/.test(error.message));
    assert.equal(calls.some((call) => call.method === "eth_estimateGas"), false);
    assert.equal(calls.some((call) => call.method === "eth_sendTransaction"), false);
  });

  it("blocks if either exact simulation or gas estimate fails", async () => {
    for (const options of [{ failEstimate: true }, { failOpenCall: true }]) {
      const { prepared, calls } = run(options);
      await assert.rejects(prepared, (error: unknown) => error instanceof OpenTrovePreflightError);
      assert.equal(calls.some((call) => call.method === "eth_sendTransaction"), false);
    }
  });
});
