import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateCollateralRatioBps, calculateTroveRisk, formatPercentBps, formatWad } from "./troveRisk";

const WAD = 10n ** 18n;

describe("Trove risk calculations", () => {
  it("calculates the current collateral ratio exactly without an MCR input", () => {
    assert.equal(calculateCollateralRatioBps({
      collateralBtcWei: 2n * WAD,
      debtMusdWei: 1_000n * WAD,
      btcUsdWei: 100_000n * WAD,
    }), 2_000_000n);
    assert.equal(calculateCollateralRatioBps({ collateralBtcWei: 0n, debtMusdWei: WAD, btcUsdWei: WAD }), null);
  });

  it("computes the live ratio, price distance, and drawdown scenarios", () => {
    const result = calculateTroveRisk({
      collateralBtcWei: 1n * WAD,
      debtMusdWei: 50_000n * WAD,
      btcUsdWei: 100_000n * WAD,
      mcrWei: 1_100_000_000_000_000_000n,
    });
    assert.ok(result);
    assert.equal(result.ratioBps, 20_000n);
    assert.equal(result.thresholdBps, 11_000n);
    assert.equal(result.belowThreshold, false);
    assert.equal(result.thresholdPriceWei, 55_000n * WAD);
    assert.equal(result.priceDistanceBps, 4_500n);
    assert.deepEqual(result.scenarios.map((scenario) => [scenario.dropPct, scenario.ratioBps, scenario.belowThreshold]), [
      [10, 18_000n, false],
      [20, 16_000n, false],
      [30, 14_000n, false],
    ]);
  });

  it("marks scenarios below the MCR and reports a negative price buffer", () => {
    const result = calculateTroveRisk({
      collateralBtcWei: 1n * WAD,
      debtMusdWei: 50_000n * WAD,
      btcUsdWei: 50_000n * WAD,
      mcrWei: 1_100_000_000_000_000_000n,
    });
    assert.ok(result);
    assert.equal(result.priceDistanceBps, -1_000n);
    assert.equal(result.belowThreshold, true);
    assert.deepEqual(result.scenarios.map((scenario) => scenario.belowThreshold), [true, true, true]);
  });

  it("rounds the threshold price upward so it never understates the required price", () => {
    const result = calculateTroveRisk({
      collateralBtcWei: 3n * WAD,
      debtMusdWei: 10n * WAD,
      btcUsdWei: 10n * WAD,
      mcrWei: 1_100_000_000_000_000_000n,
    });
    assert.ok(result);
    assert.equal(result.thresholdPriceWei, 3_666_666_666_666_666_667n);
  });

  it("returns no calculation for missing or zero values", () => {
    assert.equal(calculateTroveRisk({ collateralBtcWei: 0n, debtMusdWei: WAD, btcUsdWei: WAD, mcrWei: WAD }), null);
    assert.equal(calculateTroveRisk({ collateralBtcWei: WAD, debtMusdWei: WAD, btcUsdWei: WAD, mcrWei: 0n }), null);
  });
});

describe("risk value formatting", () => {
  it("formats WAD values with a fixed number of digits", () => {
    assert.equal(formatWad(77_298_157_400_000_000_000_000n), "77,298.16");
    assert.equal(formatWad(1_250_000_000_000_000_000n, 3), "1.250");
  });
  it("formats signed percentage basis points", () => {
    assert.equal(formatPercentBps(4_500n), "45.00%");
    assert.equal(formatPercentBps(-125n), "-1.25%");
  });
});
