/**
 * Exact-integer Mezo Testnet open-trove planner.
 * The calculator has no wallet access and never submits transactions.
 */
import { MEZO_NETWORKS } from "../config/chains";
import { MEZO_TESTNET_SELECTORS } from "./mezoAbi";

export const WAD = 10n ** 18n;
export const UINT256_MAX = (1n << 256n) - 1n;
export const MEZO_TESTNET_CHAIN_ID = MEZO_NETWORKS.testnet.chainId;
export const MEZO_TESTNET_BORROWER_OPERATIONS = MEZO_NETWORKS.testnet.borrowerOperations!.address;
export const OPEN_TROVE_SELECTOR = MEZO_TESTNET_SELECTORS.borrowerOperations.openTrove;

/** Mezo's published Testnet BorrowerOperations ABI. BTC collateral is msg.value. */
export const OPEN_TROVE_ABI = [
  {
    type: "function",
    name: "openTrove",
    stateMutability: "payable",
    inputs: [
      { name: "_debtAmount", type: "uint256" },
      { name: "_upperHint", type: "address" },
      { name: "_lowerHint", type: "address" },
    ],
    outputs: [],
  },
] as const;

export type BorrowMode = "normal" | "recovery";

/** Values read from Mezo contracts at one coherent, recent block. */
export interface OpenTroveLiveSnapshot {
  chainId: number;
  blockNumber: number;
  observedAtMs: number;
  mode: BorrowMode;
  minNetDebtWei: bigint;
  borrowingRateWei: bigint;
  gasCompensationWei: bigint;
  mcrWei: bigint;
  ccrWei: bigint;
  btcUsdWei: bigint;
  /** Unknown must never be treated as fee-exempt or non-exempt. */
  feeExempt: boolean;
  systemCollateralBtcWei: bigint;
  systemDebtWei: bigint;
  priceUpdatedAt: number;
  priceAgeSeconds: number;
}

export interface PlannerOptions {
  maxSnapshotAgeMs?: number;
  maxPriceAgeSeconds?: number;
  nowMs?: number;
}

export interface OpenTrovePlan {
  status: "unavailable" | "invalid-input" | "calculated";
  reason?: string;
  collateralWei?: bigint;
  requestWei?: bigint;
  feeWei?: bigint;
  netDebtWei?: bigint;
  reserveWei?: bigint;
  compositeDebtWei?: bigint;
  collateralValueWei?: bigint;
  icrBasisPoints?: bigint;
  icrPass?: boolean;
  minDebtPass?: boolean;
  postOpenTcrBasisPoints?: bigint | null;
  postOpenTcrPass?: boolean | null;
  allowed?: boolean;
}

/** Parse a non-negative decimal amount into exact 18-decimal units; reject exponent and excess precision. */
export function parseUnits18(input: string): bigint | null {
  const value = input.trim();
  if (value.length > 97) return null;
  const match = /^(\d+)(?:\.(\d{0,18}))?$/.exec(value);
  if (!match) return null;
  const whole = BigInt(match[1]);
  const fraction = (match[2] ?? "").padEnd(18, "0");
  return whole * WAD + BigInt(fraction || "0");
}

/** Format 18-decimal units without rounding upward; trailing zeroes are removed. */
export function formatUnits18(value: bigint, maxFractionDigits = 8): string {
  if (value < 0n) return `-${formatUnits18(-value, maxFractionDigits)}`;
  const whole = value / WAD;
  const digits = Math.max(0, Math.min(18, Math.trunc(maxFractionDigits)));
  const fraction = (value % WAD).toString().padStart(18, "0").slice(0, digits).replace(/0+$/, "");
  const wholeText = whole.toLocaleString("en-US");
  return fraction ? `${wholeText}.${fraction}` : wholeText;
}

/** Exact, parser-safe decimal representation for editable transaction inputs. */
export function formatUnits18Input(value: bigint): string {
  if (value < 0n) return `-${formatUnits18Input(-value)}`;
  const whole = value / WAD;
  const fraction = (value % WAD).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export type MinimumOpenTroveAmounts =
  | { status: "ready"; collateralWei: bigint; requestedMusdWei: bigint; collateralBtc: string; requestedMusd: string }
  | { status: "unavailable"; reason: string };

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return numerator === 0n ? 0n : (numerator + denominator - 1n) / denominator;
}

/**
 * Find the smallest exact 18-decimal input pair that passes the live net-debt,
 * ICR, and (in Normal Mode) post-open TCR equations. The result is only a
 * prefill; prepareOpenTrove still repeats live reads, eligibility, simulation,
 * and gas estimation before a wallet request can be enabled.
 */
export function calculateMinimumOpenTroveAmounts(
  snapshot: OpenTroveLiveSnapshot | null,
  options: PlannerOptions = {},
): MinimumOpenTroveAmounts {
  const nowMs = options.nowMs ?? Date.now();
  const liveError = snapshotError(snapshot, nowMs, options.maxSnapshotAgeMs ?? 60_000, options.maxPriceAgeSeconds ?? 3_600);
  if (liveError) return { status: "unavailable", reason: liveError };

  const live = snapshot as OpenTroveLiveSnapshot;
  const feeApplies = live.mode === "normal" && !live.feeExempt;
  const debtAt = (requestedWei: bigint): bigint | null => {
    if (feeApplies && live.borrowingRateWei > 0n && requestedWei > UINT256_MAX / live.borrowingRateWei) return null;
    const feeWei = feeApplies ? (requestedWei * live.borrowingRateWei) / WAD : 0n;
    const netDebtWei = requestedWei + feeWei;
    return netDebtWei <= UINT256_MAX ? netDebtWei : null;
  };

  // First bound the search to amounts whose fee and net debt fit uint256.
  let validLow = 0n;
  let validHigh = live.minNetDebtWei + 1n;
  while (validLow + 1n < validHigh) {
    const middle = (validLow + validHigh) / 2n;
    if (debtAt(middle) === null) validHigh = middle;
    else validLow = middle;
  }
  if (validLow === 0n || (debtAt(validLow) ?? 0n) < live.minNetDebtWei) {
    return { status: "unavailable", reason: "The live minimum debt and fee do not fit the contract's safe amount range." };
  }

  // Find the first requested amount whose amount-plus-fee reaches minNetDebt.
  let debtLow = 1n;
  let debtHigh = validLow;
  while (debtLow < debtHigh) {
    const middle = (debtLow + debtHigh) / 2n;
    const netDebtWei = debtAt(middle);
    if (netDebtWei !== null && netDebtWei >= live.minNetDebtWei) debtHigh = middle;
    else debtLow = middle + 1n;
  }
  const requestedMusdWei = debtLow;
  const netDebtWei = debtAt(requestedMusdWei);
  if (netDebtWei === null || netDebtWei < live.minNetDebtWei) {
    return { status: "unavailable", reason: "The live minimum debt could not be represented safely." };
  }
  const compositeDebtWei = netDebtWei + live.gasCompensationWei;
  const icrThresholdWei = live.mode === "normal" ? live.mcrWei : live.ccrWei;
  let collateralWei = ceilDiv(compositeDebtWei * icrThresholdWei, live.btcUsdWei);

  if (live.mode === "normal") {
    const requiredSystemValue = (live.systemDebtWei + compositeDebtWei) * live.ccrWei;
    const currentSystemValue = live.systemCollateralBtcWei * live.btcUsdWei;
    if (requiredSystemValue > currentSystemValue) {
      collateralWei = collateralWei > ceilDiv(requiredSystemValue - currentSystemValue, live.btcUsdWei)
        ? collateralWei
        : ceilDiv(requiredSystemValue - currentSystemValue, live.btcUsdWei);
    }
  }
  if (collateralWei <= 0n || collateralWei > UINT256_MAX) {
    return { status: "unavailable", reason: "A safe minimum BTC collateral amount could not be calculated from the live terms." };
  }

  const collateralBtc = formatUnits18Input(collateralWei);
  const requestedMusd = formatUnits18Input(requestedMusdWei);
  const plan = calculateOpenTrovePlan(live, collateralBtc, requestedMusd, {
    nowMs,
    maxSnapshotAgeMs: options.maxSnapshotAgeMs,
    maxPriceAgeSeconds: options.maxPriceAgeSeconds,
  });
  if (plan.status !== "calculated" || plan.allowed !== true) {
    return { status: "unavailable", reason: plan.status === "calculated" ? "No passing minimum amount pair is available under the current Testnet conditions." : plan.reason ?? "The live minimum amount calculation is unavailable." };
  }

  return { status: "ready", collateralWei, requestedMusdWei, collateralBtc, requestedMusd };
}

/** Percent from basis points, floored so the display never overstates a ratio. */
export function formatBasisPoints(bps: bigint | null | undefined): string {
  if (bps === null || bps === undefined) return "Unavailable";
  return `${bps / 100n}.${(bps % 100n).toString().padStart(2, "0")}%`;
}

function isNonnegativeBigInt(value: unknown): value is bigint {
  return typeof value === "bigint" && value >= 0n;
}

function snapshotError(
  snapshot: OpenTroveLiveSnapshot | null,
  nowMs: number,
  maxSnapshotAgeMs: number,
  maxPriceAgeSeconds: number,
): string | null {
  if (!snapshot) return "Live protocol data is unavailable. Refresh the contract reads before planning.";
  if (snapshot.chainId !== MEZO_TESTNET_CHAIN_ID) return "Live protocol data is not from Mezo Testnet (chain ID 31611).";
  if (!Number.isSafeInteger(snapshot.blockNumber) || snapshot.blockNumber <= 0) return "The live snapshot has no valid block number.";
  if (!Number.isFinite(snapshot.observedAtMs) || snapshot.observedAtMs <= 0) return "The live snapshot has no valid read time.";
  const age = nowMs - snapshot.observedAtMs;
  if (age < -5_000) return "The live snapshot timestamp is in the future.";
  if (age > maxSnapshotAgeMs) return "Live protocol data is stale. Refresh it before relying on this plan.";
  if (snapshot.mode !== "normal" && snapshot.mode !== "recovery") return "The current borrowing mode could not be verified.";
  if (typeof snapshot.feeExempt !== "boolean") return "The connected account's fee-exempt status could not be verified.";
  if (!Number.isSafeInteger(snapshot.priceUpdatedAt) || snapshot.priceUpdatedAt <= 0) return "The oracle update time is unavailable.";
  if (!Number.isSafeInteger(snapshot.priceAgeSeconds) || snapshot.priceAgeSeconds < 0 || snapshot.priceAgeSeconds > maxPriceAgeSeconds) {
    return "The BTC/USD oracle price is stale or its freshness could not be verified.";
  }
  if (!isNonnegativeBigInt(snapshot.minNetDebtWei) || snapshot.minNetDebtWei === 0n) return "The live minimum net debt is invalid.";
  if (!isNonnegativeBigInt(snapshot.borrowingRateWei)) return "The live borrowing rate is invalid.";
  if (!isNonnegativeBigInt(snapshot.gasCompensationWei) || snapshot.gasCompensationWei === 0n) return "The live gas reserve is invalid.";
  if (!isNonnegativeBigInt(snapshot.mcrWei) || snapshot.mcrWei === 0n || !isNonnegativeBigInt(snapshot.ccrWei) || snapshot.ccrWei === 0n || snapshot.mcrWei > snapshot.ccrWei) {
    return "The live collateral thresholds are invalid.";
  }
  if (!isNonnegativeBigInt(snapshot.btcUsdWei) || snapshot.btcUsdWei === 0n) return "The live BTC/USD price is unavailable or invalid.";
  if (!isNonnegativeBigInt(snapshot.systemCollateralBtcWei) || !isNonnegativeBigInt(snapshot.systemDebtWei)) {
    return "Live system collateral or debt is missing or invalid.";
  }
  return null;
}

function overflowsUint256(value: bigint): boolean {
  return value < 0n || value > UINT256_MAX;
}

/**
 * Calculate expected open-trove debt and protocol checks. The requested MUSD is the
 * verified `_debtAmount` argument and BTC is sent as `msg.value`. Normal-mode,
 * non-exempt accounts pay floor(amount * live borrowingRate / 1e18); Recovery Mode
 * has no borrowing fee. Inputs and intermediate contract-style arithmetic fail closed
 * when they cannot fit in uint256.
 */
export function calculateOpenTrovePlan(
  snapshot: OpenTroveLiveSnapshot | null,
  collateralBtc: string,
  requestedMusd: string,
  options: PlannerOptions = {},
): OpenTrovePlan {
  const nowMs = options.nowMs ?? Date.now();
  const liveError = snapshotError(
    snapshot,
    nowMs,
    options.maxSnapshotAgeMs ?? 60_000,
    options.maxPriceAgeSeconds ?? 3_600,
  );
  if (liveError) return { status: "unavailable", reason: liveError };

  const collateralWei = parseUnits18(collateralBtc);
  const requestWei = parseUnits18(requestedMusd);
  if (collateralWei === null || requestWei === null) {
    return { status: "invalid-input", reason: "Enter BTC collateral and requested MUSD using up to 18 decimal places." };
  }
  if (collateralWei <= 0n) return { status: "invalid-input", reason: "BTC collateral must be greater than zero." };
  if (requestWei <= 0n) return { status: "invalid-input", reason: "Requested debt must be greater than zero." };
  if (overflowsUint256(collateralWei) || overflowsUint256(requestWei)) {
    return { status: "invalid-input", reason: "The requested amount is outside the contract's uint256 range." };
  }

  const live = snapshot as OpenTroveLiveSnapshot;
  const feeApplies = live.mode === "normal" && !live.feeExempt;
  if (feeApplies && live.borrowingRateWei !== 0n && requestWei > UINT256_MAX / live.borrowingRateWei) {
    return { status: "invalid-input", reason: "The amount is too large for safe contract fee arithmetic." };
  }
  const feeWei = feeApplies ? (requestWei * live.borrowingRateWei) / WAD : 0n;
  const netDebtWei = requestWei + feeWei;
  const reserveWei = live.gasCompensationWei;
  const compositeDebtWei = netDebtWei + reserveWei;
  const collateralValueProduct = collateralWei * live.btcUsdWei;
  const icrThresholdWei = live.mode === "normal" ? live.mcrWei : live.ccrWei;
  const icrDebtProduct = compositeDebtWei * icrThresholdWei;
  const icrBasisNumerator = collateralValueProduct * 10_000n;
  const icrBasisDenominator = compositeDebtWei * WAD;
  if (
    overflowsUint256(feeWei) || overflowsUint256(netDebtWei) || overflowsUint256(compositeDebtWei) ||
    overflowsUint256(collateralValueProduct) || overflowsUint256(icrDebtProduct) ||
    overflowsUint256(icrBasisNumerator) || overflowsUint256(icrBasisDenominator)
  ) {
    return { status: "invalid-input", reason: "The entered amounts produce unsafe uint256 arithmetic for this live price and debt configuration." };
  }
  const collateralValueWei = collateralValueProduct / WAD;

  // minNetDebt applies to the amount plus fee; the gas reserve is added afterward.
  const minDebtPass = netDebtWei >= live.minNetDebtWei;
  const icrPass = collateralValueProduct >= icrDebtProduct;
  const icrBasisPoints = icrBasisNumerator / icrBasisDenominator;

  let postOpenTcrBasisPoints: bigint | null = null;
  let postOpenTcrPass: boolean | null = null;
  if (live.mode === "normal") {
    const totalCollateralBtcWei = live.systemCollateralBtcWei + collateralWei;
    const totalDebtWei = live.systemDebtWei + compositeDebtWei;
    const totalCollateralValueProduct = totalCollateralBtcWei * live.btcUsdWei;
    const tcrDebtProduct = totalDebtWei * live.ccrWei;
    const tcrBasisNumerator = totalCollateralValueProduct * 10_000n;
    const tcrBasisDenominator = totalDebtWei * WAD;
    if (overflowsUint256(totalCollateralBtcWei) || overflowsUint256(totalDebtWei) || overflowsUint256(totalCollateralValueProduct) || overflowsUint256(tcrDebtProduct) || overflowsUint256(tcrBasisNumerator) || overflowsUint256(tcrBasisDenominator)) {
      return { status: "invalid-input", reason: "This request causes unsafe uint256 arithmetic in the live system-ratio check." };
    }
    postOpenTcrBasisPoints = tcrBasisNumerator / tcrBasisDenominator;
    postOpenTcrPass = totalCollateralValueProduct >= tcrDebtProduct;
  }

  const allowed = minDebtPass && icrPass && (live.mode === "recovery" || postOpenTcrPass === true);
  return {
    status: "calculated",
    collateralWei,
    requestWei,
    feeWei,
    netDebtWei,
    reserveWei,
    compositeDebtWei,
    collateralValueWei,
    icrBasisPoints,
    icrPass,
    minDebtPass,
    postOpenTcrBasisPoints,
    postOpenTcrPass,
    allowed,
  };
}
