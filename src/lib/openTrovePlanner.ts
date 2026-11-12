/**
 * Exact-integer, read-only Mezo Testnet open-trove planner.
 * It calculates protocol checks only; it does not encode, sign, or submit transactions.
 */
import { MEZO_NETWORKS } from "../config/chains";
import { MEZO_TESTNET_SELECTORS } from "./mezoAbi";

export const WAD = 10n ** 18n;
export const MEZO_TESTNET_CHAIN_ID = MEZO_NETWORKS.testnet.chainId;
export const MEZO_TESTNET_BORROWER_OPERATIONS = MEZO_NETWORKS.testnet.borrowerOperations!.address;
export const OPEN_TROVE_SELECTOR = MEZO_TESTNET_SELECTORS.borrowerOperations.openTrove;

/** Exact explorer-verified payable BorrowerOperations ABI. BTC collateral is msg.value. */
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

/**
 * Calculate expected open-trove debt and protocol checks. The requested MUSD is the
 * verified `_debtAmount` argument. In normal mode, a non-exempt account pays
 * floor(amount * live borrowingRate / 1e18); Recovery Mode has no borrowing fee.
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

  const live = snapshot as OpenTroveLiveSnapshot;
  const feeWei = live.mode === "normal" && !live.feeExempt
    ? (requestWei * live.borrowingRateWei) / WAD
    : 0n;
  const netDebtWei = requestWei + feeWei;
  const reserveWei = live.gasCompensationWei;
  const compositeDebtWei = netDebtWei + reserveWei;
  const collateralValueWei = (collateralWei * live.btcUsdWei) / WAD;

  // minNetDebt applies to the amount plus fee; the gas reserve is added afterward.
  const minDebtPass = netDebtWei >= live.minNetDebtWei;
  const icrThresholdWei = live.mode === "normal" ? live.mcrWei : live.ccrWei;
  const icrPass = collateralWei * live.btcUsdWei >= compositeDebtWei * icrThresholdWei;
  const icrBasisPoints = (collateralWei * live.btcUsdWei * 10_000n) / (compositeDebtWei * WAD);

  let postOpenTcrBasisPoints: bigint | null = null;
  let postOpenTcrPass: boolean | null = null;
  if (live.mode === "normal") {
    const totalCollateralBtcWei = live.systemCollateralBtcWei + collateralWei;
    const totalDebtWei = live.systemDebtWei + compositeDebtWei;
    postOpenTcrBasisPoints = (totalCollateralBtcWei * live.btcUsdWei * 10_000n) / (totalDebtWei * WAD);
    postOpenTcrPass = totalCollateralBtcWei * live.btcUsdWei >= totalDebtWei * live.ccrWei;
  }

  const allowed = minDebtPass && icrPass && (live.mode === "recovery" || postOpenTcrPass === true);
  return {
    status: "calculated",
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
