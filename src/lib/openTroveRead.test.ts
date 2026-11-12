import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MEZO_NETWORKS } from "../config/chains";
import { MEZO_TESTNET_SELECTORS as S } from "./mezoAbi";
import { encodeUintResult, fakeFetch, OWNER, type Handler } from "./testHelpers";
import { createRpcClient } from "./rpc";
import { readOpenTroveSnapshot } from "./openTroveRead";

const NETWORK = MEZO_NETWORKS.testnet;
const WAD = 10n ** 18n;
const NOW_SECONDS = Math.floor(Date.parse("2026-11-12T08:00:00.000Z") / 1_000);
const BLOCK_TAG = "0x64";
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
  chainId?: string;
  oracleAgeSeconds?: number;
  feeExempt?: boolean;
  recovery?: boolean;
  emptyCodeAddress?: string;
  failingSelector?: string;
}

function handler(options: MockOptions = {}): Handler {
  return (method, params) => {
    if (method === "eth_chainId") return options.chainId ?? "0x7b7b";
    if (method === "eth_blockNumber") return BLOCK_TAG;
    if (method === "eth_getBlockByNumber") {
      assert.equal(params[0], BLOCK_TAG);
      return { number: BLOCK_TAG, timestamp: `0x${NOW_SECONDS.toString(16)}` };
    }
    if (method === "eth_getCode") {
      const address = String(params[0]).toLowerCase();
      assert.equal(params[1], BLOCK_TAG);
      if (options.emptyCodeAddress?.toLowerCase() === address) return "0x";
      return "0x60006000";
    }
    if (method === "eth_call") {
      const call = params[0] as { to: string; data: string };
      const to = call.to.toLowerCase();
      const data = call.data.toLowerCase();
      assert.equal(params[1], BLOCK_TAG);
      if (options.failingSelector && data.startsWith(options.failingSelector.toLowerCase())) {
        return new Error("execution reverted");
      }

      if (to === NETWORK.priceFeed!.address.toLowerCase()) {
        if (data === S.priceFeed.fetchPrice) return encodeUintResult(80_000n * WAD);
        if (data === S.priceFeed.oracle) return addressResult(ORACLE);
      }
      if (to === NETWORK.borrowerOperations!.address.toLowerCase()) {
        if (data === S.borrowerOperations.minNetDebt) return encodeUintResult(1_800n * WAD);
        if (data === S.borrowerOperations.borrowingRate) return encodeUintResult(10n ** 15n);
        if (data === S.borrowerOperations.gasCompensation) return encodeUintResult(200n * WAD);
        if (data === S.borrowerOperations.mcr) return encodeUintResult(11n * WAD / 10n);
        if (data === S.borrowerOperations.ccr) return encodeUintResult(15n * WAD / 10n);
        if (data === S.borrowerOperations.getEntireSystemColl) return encodeUintResult(100n * WAD);
        if (data === S.borrowerOperations.getEntireSystemDebt) return encodeUintResult(1_000_000n * WAD);
        if (data === S.borrowerOperations.governableVariables) return addressResult(GOVERNABLE);
      }
      if (to === GOVERNABLE.toLowerCase() && data === `${S.governableVariables.feeExemptAccounts}${OWNER.slice(2).toLowerCase().padStart(64, "0")}`) {
        return encodeUintResult(options.feeExempt ? 1n : 0n);
      }
      if (to === ORACLE.toLowerCase()) {
        if (data === S.priceOracleCaller.decimals) return encodeUintResult(8n);
        if (data === S.priceOracleCaller.latestRoundData) {
          const age = options.oracleAgeSeconds ?? 60;
          return roundData(8_000_000_000_000n, NOW_SECONDS - age);
        }
      }
      if (to === NETWORK.troveManager!.address.toLowerCase() && data.startsWith(S.troveManager.checkRecoveryMode)) {
        return encodeUintResult(options.recovery ? 1n : 0n);
      }
      return new Error(`unexpected eth_call ${to} ${data}`);
    }
    return new Error(`unexpected RPC method ${method}`);
  };
}

function run(mock: MockOptions = {}, network = NETWORK) {
  const f = fakeFetch(handler(mock));
  const rpc = createRpcClient({ url: network.rpcUrl, fetchImpl: f.fetchImpl });
  return { result: readOpenTroveSnapshot({ network, owner: OWNER, rpc }), calls: f.calls };
}

describe("open-trove live read layer", () => {
  it("returns all planner inputs from a single chain-checked block", async () => {
    const { result, calls } = run({ feeExempt: true, recovery: true });
    const read = await result;
    assert.equal(read.status, "ok");
    if (read.status === "ok") {
      const live = read.snapshot;
      assert.equal(live.chainId, 31611);
      assert.equal(live.blockNumber, 100);
      assert.equal(live.observedAtMs, NOW_SECONDS * 1_000);
      assert.equal(live.mode, "recovery");
      assert.equal(live.minNetDebtWei, 1_800n * WAD);
      assert.equal(live.borrowingRateWei, 10n ** 15n);
      assert.equal(live.gasCompensationWei, 200n * WAD);
      assert.equal(live.mcrWei, 11n * WAD / 10n);
      assert.equal(live.ccrWei, 15n * WAD / 10n);
      assert.equal(live.btcUsdWei, 80_000n * WAD);
      assert.equal(live.feeExempt, true);
      assert.equal(live.systemCollateralBtcWei, 100n * WAD);
      assert.equal(live.systemDebtWei, 1_000_000n * WAD);
      assert.equal(live.priceAgeSeconds, 60);
    }
    const callsAtAnyBlock = calls.filter((entry) => entry.method === "eth_call");
    assert.ok(callsAtAnyBlock.length >= 10);
    assert.ok(callsAtAnyBlock.every((entry) => entry.params[1] === BLOCK_TAG));
    const codeReads = calls.filter((entry) => entry.method === "eth_getCode");
    assert.ok(codeReads.length >= 5);
    assert.ok(codeReads.every((entry) => entry.params[1] === BLOCK_TAG));
  });

  it("rejects wrong-chain reads before any contract call", async () => {
    const { result, calls } = run({ chainId: "0x7b7c" });
    assert.deepEqual(await result, { status: "wrong-network", actualChainId: 31612, expectedChainId: 31611 });
    assert.equal(calls.some((entry) => entry.method === "eth_call" || entry.method === "eth_getCode"), false);
  });

  it("rejects stale oracle data", async () => {
    const { result } = run({ oracleAgeSeconds: 3_601 });
    const read = await result;
    assert.equal(read.status, "error");
    if (read.status === "error") {
      assert.equal(read.kind, "stale-data");
      assert.match(read.message, /stale/);
    }
  });

  it("rejects configured addresses without contract code", async () => {
    const { result } = run({ emptyCodeAddress: NETWORK.priceFeed!.address });
    const read = await result;
    assert.equal(read.status, "error");
    if (read.status === "error") assert.match(read.message, /no contract code/);
  });

  it("fails closed when a required live parameter read reverts", async () => {
    const { result } = run({ failingSelector: S.borrowerOperations.minNetDebt });
    const read = await result;
    assert.equal(read.status, "error");
  });

  it("does not use unconfigured mainnet contract fields", async () => {
    const { result, calls } = run({}, MEZO_NETWORKS.mainnet);
    assert.deepEqual(await result, {
      status: "not-configured",
      reason: "Verified open-trove read contracts are not configured for Mezo Mainnet.",
    });
    assert.equal(calls.length, 0);
  });
});
