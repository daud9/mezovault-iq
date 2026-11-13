import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MEZO_NETWORKS } from "../config/chains";
import { MEZO_TESTNET_SELECTORS as S } from "./mezoAbi";
import { encodeUintResult, fakeFetch, type Handler } from "./testHelpers";
import { createRpcClient } from "./rpc";
import { confirmReviewedOpenTrove, formatOpenTroveActionError } from "./openTroveConfirmation";
import { requestWalletTransaction, type Eip1193Provider } from "./wallet";
import {
  OpenTrovePreflightError,
  prepareOpenTrove,
  sameOpenTroveReview,
} from "./openTroveExecution";
import {
  OPEN_TROVE_SELECTOR,
  parseUnits18,
  WAD,
} from "./openTrovePlanner";

const NETWORK = MEZO_NETWORKS.testnet;
const ACCOUNT = "0x1111111111111111111111111111111111111111" as const;
const NOW_SECONDS = Math.floor(Date.parse("2026-11-12T08:00:00.000Z") / 1_000);
const NOW_MS = NOW_SECONDS * 1_000;
const BLOCK_TAG = "0x100";
const GOVERNABLE = "0x3333333333333333333333333333333333333333";
const ORACLE = "0x7b7c000000000000000000000000000000000015";
const ZERO = "0".repeat(64);

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
  troveStatus?: bigint;
  existingCollateral?: bigint;
  existingDebt?: bigint;
  minNetDebtWei?: bigint;
  oracleAgeSeconds?: number;
  wrongRpcChain?: boolean;
  failEstimate?: boolean;
  failOpenCall?: boolean;
}

function handler(options: MockOptions = {}): Handler {
  return (method, params) => {
    if (method === "eth_chainId") return options.wrongRpcChain ? "0x7b7c" : "0x7b7b";
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
      assert.ok(BigInt(tx.value) > 0n);
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
        assert.ok(BigInt(call.value ?? "0x0") > 0n);
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
          return encodeUintResult(options.troveStatus ?? (options.activeTrove ? 1n : 0n));
        }
        if (data === `${S.troveManager.getTroveColl}${ACCOUNT.slice(2).toLowerCase().padStart(64, "0")}`) return encodeUintResult(options.existingCollateral ?? 0n);
        if (data === `${S.troveManager.getTroveDebt}${ACCOUNT.slice(2).toLowerCase().padStart(64, "0")}`) return encodeUintResult(options.existingDebt ?? 0n);
        if (data.startsWith(S.troveManager.checkRecoveryMode)) return encodeUintResult(0n);
      }
      return new Error(`unexpected eth_call ${to} ${data}`);
    }
    return new Error(`unexpected RPC method ${method}`);
  };
}

function run(
  options: MockOptions = {},
  amounts: { collateralBtc?: string; requestedMusd?: string } = {},
) {
  const mock = fakeFetch(handler(options));
  const rpc = createRpcClient({ url: NETWORK.rpcUrl, fetchImpl: mock.fetchImpl });
  const collateralBtc = amounts.collateralBtc ?? "0.08";
  const requestedMusd = amounts.requestedMusd ?? "2500";
  return {
    calls: mock.calls,
    rpc,
    prepared: prepareOpenTrove({
      account: ACCOUNT,
      walletChainId: NETWORK.chainId,
      collateralBtc,
      requestedMusd,
      rpc,
      nowMs: NOW_MS,
    }),
  };
}

function expectedCallData(requestedMusd: string): string {
  const debtWei = parseUnits18(requestedMusd)!;
  return `${OPEN_TROVE_SELECTOR}${word(debtWei)}${ZERO}${ZERO}`;
}

describe("general Mezo Testnet openTrove preflight", () => {
  it("prepares the editable amount as exact calldata and native BTC value after same-block checks and simulations", async () => {
    const { prepared, calls } = run({}, { collateralBtc: "0.08", requestedMusd: "2500.125" });
    const result = await prepared;
    const expectedGas = 8_032_123n;
    const expectedLimit = (expectedGas * 120n + 99n) / 100n;
    assert.deepEqual(result.transaction, {
      from: ACCOUNT,
      to: "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5",
      data: expectedCallData("2500.125"),
      value: `0x${parseUnits18("0.08")!.toString(16)}`,
      gas: `0x${expectedLimit.toString(16)}`,
    });
    assert.equal(result.account, ACCOUNT);
    assert.equal(result.snapshot.blockNumber, 256);
    assert.equal(result.plan.status, "calculated");
    assert.equal(result.plan.allowed, true);
    assert.equal(result.plan.collateralWei, parseUnits18("0.08"));
    assert.equal(result.plan.requestWei, parseUnits18("2500.125"));
    const pinnedCalls = calls.filter((call) => call.method === "eth_call" || call.method === "eth_estimateGas");
    assert.ok(pinnedCalls.length > 0);
    assert.ok(pinnedCalls.every((call) => call.params[1] === BLOCK_TAG));
    assert.ok(calls.some((call) => call.method === "eth_estimateGas"));
    assert.ok(calls.some((call) => call.method === "eth_call" && (call.params[0] as { data?: string }).data?.startsWith(OPEN_TROVE_SELECTOR)));
    assert.equal(calls.some((call) => call.method === "eth_sendTransaction"), false);
  });

  it("rejects missing account and wallet-chain mismatch before any RPC work", async () => {
    const mock = fakeFetch(handler());
    const rpc = createRpcClient({ url: NETWORK.rpcUrl, fetchImpl: mock.fetchImpl });
    await assert.rejects(
      prepareOpenTrove({ account: null, walletChainId: 31611, collateralBtc: "1", requestedMusd: "2000", rpc, nowMs: NOW_MS }),
      OpenTrovePreflightError,
    );
    await assert.rejects(
      prepareOpenTrove({ account: ACCOUNT, walletChainId: 1, collateralBtc: "1", requestedMusd: "2000", rpc, nowMs: NOW_MS }),
      (error: unknown) => error instanceof OpenTrovePreflightError && /not on Mezo Testnet/.test(error.message),
    );
    assert.equal(mock.calls.length, 0);
  });

  it("rejects when the live RPC reports a different chain before estimating or simulating", async () => {
    const { prepared, calls } = run({ wrongRpcChain: true });
    await assert.rejects(prepared, OpenTrovePreflightError);
    assert.equal(calls.some((call) => call.method === "eth_estimateGas"), false);
    assert.equal(calls.some((call) => call.method === "eth_sendTransaction"), false);
  });

  it("blocks malformed, non-positive, over-precision, and uint256-overflowing amounts before simulation", async () => {
    const invalid = [
      { collateralBtc: "0", requestedMusd: "2500" },
      { collateralBtc: "-0.1", requestedMusd: "2500" },
      { collateralBtc: "1.0000000000000000001", requestedMusd: "2500" },
      { collateralBtc: "1e3", requestedMusd: "2500" },
      { collateralBtc: "1", requestedMusd: "0" },
      { collateralBtc: "1", requestedMusd: "1e3" },
      { collateralBtc: "1", requestedMusd: "9".repeat(80) },
    ];
    for (const values of invalid) {
      const { prepared, calls } = run({}, values);
      await assert.rejects(prepared, OpenTrovePreflightError);
      assert.equal(calls.some((call) => call.method === "eth_estimateGas"), false, JSON.stringify(values));
      assert.equal(calls.some((call) => call.method === "eth_sendTransaction"), false);
    }
  });

  it("blocks if planner values are unsafe or live debt/ICR/TCR checks fail", async () => {
    const tooLargeForProtocolMath = run({}, { collateralBtc: "1", requestedMusd: "100000000000000000000000000000000000000" });
    await assert.rejects(tooLargeForProtocolMath.prepared, OpenTrovePreflightError);
    assert.equal(tooLargeForProtocolMath.calls.some((call) => call.method === "eth_estimateGas"), false);

    const minDebtFail = run({ minNetDebtWei: 4_000n * WAD });
    await assert.rejects(minDebtFail.prepared, OpenTrovePreflightError);
    assert.equal(minDebtFail.calls.some((call) => call.method === "eth_estimateGas"), false);
  });

  it("blocks stale oracle data and a stale same-block snapshot", async () => {
    const staleOracle = run({ oracleAgeSeconds: 3_601 });
    await assert.rejects(staleOracle.prepared, OpenTrovePreflightError);
    assert.equal(staleOracle.calls.some((call) => call.method === "eth_estimateGas"), false);

    const staleSnapshot = fakeFetch(handler());
    const rpc = createRpcClient({ url: NETWORK.rpcUrl, fetchImpl: staleSnapshot.fetchImpl });
    await assert.rejects(
      prepareOpenTrove({ account: ACCOUNT, walletChainId: 31611, collateralBtc: "0.08", requestedMusd: "2500", rpc, nowMs: NOW_MS + 60_001 }),
      (error: unknown) => error instanceof OpenTrovePreflightError && /stale/.test(error.message),
    );
    assert.equal(staleSnapshot.calls.some((call) => call.method === "eth_estimateGas"), false);
  });

  it("blocks active, non-empty, or unrecognized Trove states before the open call simulation", async () => {
    const existingPositions = [
      { activeTrove: true },
      { existingCollateral: 1n },
      { existingDebt: 1n },
    ];
    for (const options of existingPositions) {
      const { prepared, calls } = run(options);
      await assert.rejects(prepared, (error: unknown) => error instanceof OpenTrovePreflightError && error.code === "existing-trove");
      assert.equal(calls.some((call) => call.method === "eth_estimateGas"), false);
      assert.equal(calls.some((call) => call.method === "eth_call" && (call.params[0] as { data?: string }).data?.startsWith(OPEN_TROVE_SELECTOR)), false);
    }

    const unknownStatus = run({ troveStatus: 5n });
    await assert.rejects(unknownStatus.prepared, (error: unknown) => error instanceof OpenTrovePreflightError && error.code === "preflight");
    assert.equal(unknownStatus.calls.some((call) => call.method === "eth_estimateGas"), false);
    assert.equal(unknownStatus.calls.some((call) => call.method === "eth_call" && (call.params[0] as { data?: string }).data?.startsWith(OPEN_TROVE_SELECTOR)), false);
  });

  it("blocks when exact gas estimation or exact-call simulation reverts", async () => {
    for (const options of [{ failEstimate: true }, { failOpenCall: true }]) {
      const { prepared, calls } = run(options);
      await assert.rejects(prepared, (error: unknown) => error instanceof OpenTrovePreflightError);
      assert.equal(calls.some((call) => call.method === "eth_sendTransaction"), false);
    }
  });

  it("allows an older review only when the fresh preflight still matches every material term", async () => {
    const { prepared: first, calls } = run();
    const a = await first;
    const { prepared: second } = run();
    const b = await second;
    assert.equal(sameOpenTroveReview(a, b), true);
    assert.equal(sameOpenTroveReview({ ...a, reviewedAtMs: a.reviewedAtMs - 60_000 }, b), true);
    assert.equal(sameOpenTroveReview({ ...a, gasEstimate: a.gasEstimate + 1n }, b), false);
    assert.equal(
      sameOpenTroveReview({ ...a, snapshot: { ...a.snapshot, systemDebtWei: a.snapshot.systemDebtWei + 1n } }, b),
      false,
    );
    const { prepared: differentAmounts } = run({}, { collateralBtc: "0.09", requestedMusd: "2500" });
    assert.equal(sameOpenTroveReview(a, await differentAmounts), false);
    assert.equal(calls.some((call) => call.method === "eth_sendTransaction"), false);
  });
});

describe("final open-Trove confirmation", () => {
  it("rechecks all conditions and reaches the injected provider only after the explicit final confirmation path passes", async () => {
    const { calls: rpcCalls, rpc, prepared } = run();
    const review = await prepared;
    const hash = `0x${"b".repeat(64)}`;
    const providerCalls: string[] = [];
    const provider: Eip1193Provider = {
      request: async ({ method, params }) => {
        providerCalls.push(method);
        if (method === "eth_accounts") return [ACCOUNT];
        if (method === "eth_chainId") return "0x7b7b";
        if (method === "eth_sendTransaction") {
          assert.deepEqual(params, [{ ...review.transaction }]);
          return hash;
        }
        throw new Error(`unexpected provider method ${method}`);
      },
    };
    const result = await confirmReviewedOpenTrove({
      review,
      recheck: () => prepareOpenTrove({
        account: ACCOUNT,
        walletChainId: NETWORK.chainId,
        collateralBtc: "0.08",
        requestedMusd: "2500",
        rpc,
        nowMs: NOW_MS,
      }),
      reviewIsCurrent: () => true,
      sendTransaction: (tx, expected) => requestWalletTransaction(provider, tx, expected, NETWORK.chainId),
      onWalletRequest: () => providerCalls.push("explicit-final-click-approved"),
    });

    assert.equal(result.status, "submitted");
    if (result.status === "submitted") assert.equal(result.hash, hash);
    assert.deepEqual(providerCalls, ["explicit-final-click-approved", "eth_accounts", "eth_chainId", "eth_sendTransaction"]);
    assert.ok(rpcCalls.some((call) => call.method === "eth_estimateGas"));
    assert.equal(rpcCalls.some((call) => call.method === "eth_sendTransaction"), false);
  });

  it("surfaces a failed fresh check and does not call the injected provider", async () => {
    const { prepared } = run();
    const review = await prepared;
    const failure = new OpenTrovePreflightError("The current Testnet Trove could not be verified (RPC timeout). Refresh and retry; no wallet request was made.");
    let walletCalls = 0;

    await assert.rejects(confirmReviewedOpenTrove({
      review,
      recheck: async () => { throw failure; },
      reviewIsCurrent: () => true,
      sendTransaction: async () => { walletCalls += 1; return `0x${"b".repeat(64)}`; },
    }), (caught: unknown) => caught === failure);
    assert.equal(walletCalls, 0);
    assert.equal(formatOpenTroveActionError(failure), failure.message);
    assert.match(formatOpenTroveActionError(new Error("transport unavailable"), "preflight"), /transport unavailable.*No wallet request was made/i);
  });

  it("refreshes the review instead of opening the wallet when material terms change", async () => {
    const { prepared } = run();
    const review = await prepared;
    let walletCalls = 0;
    const result = await confirmReviewedOpenTrove({
      review,
      recheck: async () => ({ ...review, gasEstimate: review.gasEstimate + 1n }),
      reviewIsCurrent: () => true,
      sendTransaction: async () => { walletCalls += 1; return `0x${"b".repeat(64)}`; },
    });
    assert.equal(result.status, "changed");
    assert.equal(walletCalls, 0);
  });
});
