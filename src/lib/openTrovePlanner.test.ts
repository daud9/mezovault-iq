import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toFunctionSelector } from "viem";
import {
  calculateOpenTrovePlan,
  calculateMinimumOpenTroveAmounts,
  formatBasisPoints,
  formatUnits18,
  formatUnits18Input,
  MEZO_TESTNET_BORROWER_OPERATIONS,
  MEZO_TESTNET_CHAIN_ID,
  OPEN_TROVE_ABI,
  OPEN_TROVE_SELECTOR,
  parseUnits18,
  UINT256_MAX,
  WAD,
  type OpenTroveLiveSnapshot,
} from "./openTrovePlanner";

const NOW = Date.parse("2026-11-12T08:00:00.000Z");
const base = (overrides: Partial<OpenTroveLiveSnapshot> = {}): OpenTroveLiveSnapshot => ({
  chainId: MEZO_TESTNET_CHAIN_ID,
  blockNumber: 123,
  observedAtMs: NOW,
  mode: "normal",
  minNetDebtWei: 1_800n * WAD,
  borrowingRateWei: 10n ** 15n,
  gasCompensationWei: 200n * WAD,
  mcrWei: 11n * WAD / 10n,
  ccrWei: 15n * WAD / 10n,
  btcUsdWei: 80_000n * WAD,
  feeExempt: false,
  systemCollateralBtcWei: 100n * WAD,
  systemDebtWei: 1_000_000n * WAD,
  priceUpdatedAt: NOW / 1_000 - 60,
  priceAgeSeconds: 60,
  ...overrides,
});

describe("read-only open-trove planner", () => {
  it("derives the smallest fee-adjusted debt and collateral that pass live Normal Mode checks", () => {
    const result = calculateMinimumOpenTroveAmounts(base(), { nowMs: NOW });
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;
    assert.equal(result.requestedMusd, "1798.201798201798201799");
    assert.equal(result.collateralBtc, "0.0275");
    const exact = calculateOpenTrovePlan(base(), result.collateralBtc, result.requestedMusd, { nowMs: NOW });
    assert.equal(exact.status, "calculated");
    if (exact.status === "calculated") {
      assert.equal(exact.minDebtPass, true);
      assert.equal(exact.icrPass, true);
      assert.equal(exact.allowed, true);
    }
    const oneWeiLessCollateral = calculateOpenTrovePlan(base(), formatUnits18Input(result.collateralWei - 1n), result.requestedMusd, { nowMs: NOW });
    assert.equal(oneWeiLessCollateral.status, "calculated");
    if (oneWeiLessCollateral.status === "calculated") assert.equal(oneWeiLessCollateral.icrPass, false);
    const oneWeiLessDebt = calculateOpenTrovePlan(base(), result.collateralBtc, formatUnits18Input(result.requestedMusdWei - 1n), { nowMs: NOW });
    assert.equal(oneWeiLessDebt.status, "calculated");
    if (oneWeiLessDebt.status === "calculated") assert.equal(oneWeiLessDebt.minDebtPass, false);
  });

  it("derives no-fee minimum debt for exempt accounts and Recovery Mode", () => {
    const exempt = calculateMinimumOpenTroveAmounts(base({ feeExempt: true }), { nowMs: NOW });
    const recovery = calculateMinimumOpenTroveAmounts(base({ mode: "recovery" }), { nowMs: NOW });
    assert.equal(exempt.status, "ready");
    assert.equal(recovery.status, "ready");
    if (exempt.status === "ready") assert.equal(exempt.requestedMusd, "1800");
    if (recovery.status === "ready") assert.equal(recovery.requestedMusd, "1800");
  });

  it("adds the exact collateral required to bring a Normal Mode post-open TCR to CCR", () => {
    const snapshot = base({
      minNetDebtWei: 100n * WAD,
      borrowingRateWei: 0n,
      systemCollateralBtcWei: 15n * WAD / 10n,
      systemDebtWei: 100_000n * WAD,
    });
    const result = calculateMinimumOpenTroveAmounts(snapshot, { nowMs: NOW });
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;
    const plan = calculateOpenTrovePlan(snapshot, result.collateralBtc, result.requestedMusd, { nowMs: NOW });
    assert.equal(plan.status, "calculated");
    if (plan.status === "calculated") {
      assert.equal(plan.postOpenTcrPass, true);
      assert.equal(plan.allowed, true);
    }
  });

  it("fails closed when the snapshot is stale or no safe amount pair fits", () => {
    assert.equal(calculateMinimumOpenTroveAmounts(base({ observedAtMs: NOW - 60_001 }), { nowMs: NOW }).status, "unavailable");
    assert.equal(calculateMinimumOpenTroveAmounts(base({ btcUsdWei: 0n }), { nowMs: NOW }).status, "unavailable");
  });

  it("applies the live-rate floor exactly at minNetDebt and rejects one wei less", () => {
    const exact = calculateOpenTrovePlan(base(), "1", "1798.201798201798201799", { nowMs: NOW });
    assert.equal(exact.status, "calculated");
    if (exact.status === "calculated") {
      assert.equal(exact.feeWei, 1_798_201_798_201_798_201n);
      assert.equal(exact.netDebtWei, 1_800n * WAD);
      assert.equal(exact.minDebtPass, true);
    }

    const below = calculateOpenTrovePlan(base(), "1", "1798.201798201798201798", { nowMs: NOW });
    assert.equal(below.status, "calculated");
    if (below.status === "calculated") {
      assert.equal(below.netDebtWei, 1_800n * WAD - 1n);
      assert.equal(below.minDebtPass, false);
      assert.equal(below.allowed, false);
    }
  });

  it("adds the reserve after fee/minimum debt and uses composite debt for ICR", () => {
    const result = calculateOpenTrovePlan(
      base({ minNetDebtWei: 1_000n * WAD, borrowingRateWei: 0n, btcUsdWei: 1_200n * WAD, mcrWei: WAD }),
      "1",
      "1000",
      { nowMs: NOW },
    );
    assert.equal(result.status, "calculated");
    if (result.status === "calculated") {
      assert.equal(result.feeWei, 0n);
      assert.equal(result.netDebtWei, 1_000n * WAD);
      assert.equal(result.reserveWei, 200n * WAD);
      assert.equal(result.compositeDebtWei, 1_200n * WAD);
      assert.equal(result.icrBasisPoints, 10_000n);
      assert.equal(result.icrPass, true);
    }
  });

  it("waives the fee for fee-exempt accounts and in Recovery Mode", () => {
    const exempt = calculateOpenTrovePlan(base({ feeExempt: true }), "1", "1800", { nowMs: NOW });
    assert.equal(exempt.status, "calculated");
    if (exempt.status === "calculated") assert.equal(exempt.feeWei, 0n);

    const recovery = calculateOpenTrovePlan(
      base({ mode: "recovery", feeExempt: false, borrowingRateWei: 10n ** 17n }),
      "1",
      "1800",
      { nowMs: NOW },
    );
    assert.equal(recovery.status, "calculated");
    if (recovery.status === "calculated") {
      assert.equal(recovery.feeWei, 0n);
      assert.equal(recovery.postOpenTcrBasisPoints, null);
      assert.equal(recovery.postOpenTcrPass, null);
    }
  });

  it("requires normal-mode ICR ≥ MCR and projected TCR ≥ CCR", () => {
    const tcrFail = calculateOpenTrovePlan(
      base({
        minNetDebtWei: 100n * WAD,
        borrowingRateWei: 0n,
        btcUsdWei: 1_000n * WAD,
        systemCollateralBtcWei: 15n * WAD / 10n,
        systemDebtWei: 1_000n * WAD,
      }),
      "1.1",
      "800",
      { nowMs: NOW },
    );
    assert.equal(tcrFail.status, "calculated");
    if (tcrFail.status === "calculated") {
      assert.equal(tcrFail.icrPass, true);
      assert.equal(tcrFail.postOpenTcrPass, false);
      assert.equal(tcrFail.allowed, false);
    }
  });

  it("requires Recovery Mode ICR ≥ CCR rather than MCR and omits the TCR rule", () => {
    const result = calculateOpenTrovePlan(
      base({
        mode: "recovery",
        minNetDebtWei: 100n * WAD,
        borrowingRateWei: 0n,
        btcUsdWei: 1_000n * WAD,
        mcrWei: 11n * WAD / 10n,
        ccrWei: 15n * WAD / 10n,
      }),
      "1.4",
      "800",
      { nowMs: NOW },
    );
    assert.equal(result.status, "calculated");
    if (result.status === "calculated") {
      assert.equal(result.icrPass, false);
      assert.equal(result.postOpenTcrPass, null);
      assert.equal(result.allowed, false);
    }
  });

  it("fails closed for stale, future, wrong-chain, missing, or invalid live data", () => {
    assert.equal(calculateOpenTrovePlan(base({ observedAtMs: NOW - 60_001 }), "1", "1800", { nowMs: NOW }).status, "unavailable");
    assert.equal(calculateOpenTrovePlan(base({ observedAtMs: NOW + 5_001 }), "1", "1800", { nowMs: NOW }).status, "unavailable");
    assert.equal(calculateOpenTrovePlan(base({ chainId: 1 }), "1", "1800", { nowMs: NOW }).status, "unavailable");
    assert.equal(calculateOpenTrovePlan(base({ systemDebtWei: undefined as unknown as bigint }), "1", "1800", { nowMs: NOW }).status, "unavailable");
    assert.equal(calculateOpenTrovePlan(base({ priceAgeSeconds: 3_601 }), "1", "1800", { nowMs: NOW }).status, "unavailable");
  });

  it("rejects exponent notation, excess precision, and non-positive amounts", () => {
    assert.equal(calculateOpenTrovePlan(base(), "1.0000000000000000001", "1800", { nowMs: NOW }).status, "invalid-input");
    assert.equal(calculateOpenTrovePlan(base(), "1", "1e3", { nowMs: NOW }).status, "invalid-input");
    assert.equal(calculateOpenTrovePlan(base(), "0", "1800", { nowMs: NOW }).status, "invalid-input");
  });

  it("rejects pathological-length input, uint256 overflow, and unsafe intermediate arithmetic", () => {
    assert.equal(parseUnits18("9".repeat(100)), null);
    assert.equal(calculateOpenTrovePlan(base(), "1", "9".repeat(78), { nowMs: NOW }).status, "invalid-input");
    assert.equal(calculateOpenTrovePlan(base({ btcUsdWei: UINT256_MAX }), "1", "1800", { nowMs: NOW }).status, "invalid-input");
    assert.equal(calculateOpenTrovePlan(base({ borrowingRateWei: UINT256_MAX }), "1", "2", { nowMs: NOW }).status, "invalid-input");
  });

  it("formats integer amounts and basis points without floating point", () => {
    assert.equal(formatUnits18(1_234_500_000_000_000_000_000n, 4), "1,234.5");
    assert.equal(formatBasisPoints(12_345n), "123.45%");
  });

  it("records only the verified payable openTrove ABI and selector", () => {
    assert.equal(MEZO_TESTNET_BORROWER_OPERATIONS, "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5");
    assert.equal(OPEN_TROVE_SELECTOR, "0x2f3a6d98");
    assert.equal(toFunctionSelector("openTrove(uint256,address,address)"), OPEN_TROVE_SELECTOR);
    assert.equal(OPEN_TROVE_ABI.length, 1);
    assert.equal(OPEN_TROVE_ABI[0].name, "openTrove");
    assert.equal(OPEN_TROVE_ABI[0].stateMutability, "payable");
    assert.deepEqual(OPEN_TROVE_ABI[0].inputs.map((input) => input.type), ["uint256", "address", "address"]);
    assert.deepEqual(OPEN_TROVE_ABI[0].inputs.map((input) => input.name), ["_debtAmount", "_upperHint", "_lowerHint"]);
    assert.deepEqual(OPEN_TROVE_ABI[0].outputs, []);
  });
});
