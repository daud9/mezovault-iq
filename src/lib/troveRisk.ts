const WAD = 10n ** 18n;

export interface TroveRiskScenario {
  dropPct: 10 | 20 | 30;
  ratioBps: bigint;
  belowThreshold: boolean;
}

export interface TroveRiskResult {
  ratioBps: bigint;
  thresholdBps: bigint;
  belowThreshold: boolean;
  thresholdPriceWei: bigint;
  /** Signed percentage basis points: positive means a BTC price fall to MCR remains. */
  priceDistanceBps: bigint;
  scenarios: TroveRiskScenario[];
}

/** Status 4 is a historical redemption disposition, not a live risk verdict. */
export function classifyHistoricalTroveRisk(troveStatus: number): "RISK-ESCAPED" | null {
  return troveStatus === 4 ? "RISK-ESCAPED" : null;
}

/** Computes the collateral/debt percentage in basis points without floating-point math. */
export function calculateCollateralRatioBps(input: {
  collateralBtcWei: bigint;
  debtMusdWei: bigint;
  btcUsdWei: bigint;
}): bigint | null {
  const { collateralBtcWei, debtMusdWei, btcUsdWei } = input;
  if (collateralBtcWei <= 0n || debtMusdWei <= 0n || btcUsdWei <= 0n) return null;
  const ratioWad = (collateralBtcWei * btcUsdWei) / debtMusdWei;
  return (ratioWad * 10_000n) / WAD;
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

/**
 * Calculates the current Trove collateral ratio, BTC price at the live MCR,
 * remaining price distance, and explicit BTC drawdown scenarios. All inputs
 * are 18-decimal values from read-only contract reads; no floating point math
 * is used for threshold comparisons.
 */
export function calculateTroveRisk(input: {
  collateralBtcWei: bigint;
  debtMusdWei: bigint;
  btcUsdWei: bigint;
  mcrWei: bigint;
}): TroveRiskResult | null {
  const { collateralBtcWei, debtMusdWei, btcUsdWei, mcrWei } = input;
  if (collateralBtcWei <= 0n || debtMusdWei <= 0n || btcUsdWei <= 0n || mcrWei <= 0n) return null;

  const ratioBps = calculateCollateralRatioBps({ collateralBtcWei, debtMusdWei, btcUsdWei });
  if (ratioBps === null) return null;
  const ratioWad = (collateralBtcWei * btcUsdWei) / debtMusdWei;
  const thresholdBps = (mcrWei * 10_000n) / WAD;
  const thresholdPriceWei = ceilDiv(debtMusdWei * mcrWei, collateralBtcWei);
  const signedPriceDelta = btcUsdWei - thresholdPriceWei;
  const priceDistanceBps = (signedPriceDelta * 10_000n) / btcUsdWei;
  const scenarios = ([10, 20, 30] as const).map((dropPct) => {
    const scenarioPriceWei = (btcUsdWei * BigInt(100 - dropPct)) / 100n;
    const scenarioRatioWad = (collateralBtcWei * scenarioPriceWei) / debtMusdWei;
    const scenarioRatioBps = (scenarioRatioWad * 10_000n) / WAD;
    return {
      dropPct,
      ratioBps: scenarioRatioBps,
      belowThreshold: scenarioRatioWad < mcrWei,
    };
  });

  return { ratioBps, thresholdBps, belowThreshold: ratioWad < mcrWei, thresholdPriceWei, priceDistanceBps, scenarios };
}

/** Format an 18-decimal value as a rounded human-readable decimal. */
export function formatWad(value: bigint, fractionDigits = 2): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const digits = Math.max(0, Math.min(18, Math.trunc(fractionDigits)));
  const scale = 10n ** BigInt(digits);
  const rounded = (absolute * scale + WAD / 2n) / WAD;
  const whole = rounded / scale;
  const fraction = digits === 0 ? "" : (rounded % scale).toString().padStart(digits, "0");
  const suffix = digits > 0 ? `.${fraction}` : "";
  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}${suffix}`;
}

export function formatPercentBps(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}%`;
}
