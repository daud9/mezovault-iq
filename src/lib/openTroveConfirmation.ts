import {
  calculateOpenTrovePlan,
  MEZO_TESTNET_BORROWER_OPERATIONS,
  MEZO_TESTNET_CHAIN_ID,
  OPEN_TROVE_SELECTOR,
  parseUnits18,
  UINT256_MAX,
} from "./openTrovePlanner";
import {
  OpenTrovePreflightError,
  sameOpenTroveReview,
  type PreparedOpenTrove,
} from "./openTroveExecution";
import { describeWalletError, type WalletExpectation } from "./wallet";

export interface ReadyOpenTrove {
  key: string;
  prepared: PreparedOpenTrove;
  checkedAtMs: number;
}

export type ReadyOpenTroveRequestResult =
  | { status: "not-ready" }
  | { status: "stale" }
  | { status: "context-changed" }
  | { status: "requested"; promise: Promise<string> };

export const MAX_READY_OPEN_TROVE_AGE_MS = 60_000;
const MAX_OPEN_TROVE_PRICE_AGE_SECONDS = 3_600;

const ZERO_ADDRESS_WORD = "0".repeat(64);

function priceAgeAtTapSeconds(prepared: PreparedOpenTrove, nowMs: number): number | null {
  const snapshot = prepared.snapshot;
  if (
    !Number.isSafeInteger(snapshot.priceUpdatedAt) || snapshot.priceUpdatedAt <= 0 ||
    !Number.isSafeInteger(snapshot.priceAgeSeconds) || snapshot.priceAgeSeconds < 0 ||
    !Number.isFinite(snapshot.observedAtMs) || !Number.isFinite(nowMs)
  ) return null;
  const elapsedSinceBlockSeconds = Math.max(0, Math.ceil((nowMs - snapshot.observedAtMs) / 1_000));
  const ageFromSnapshot = snapshot.priceAgeSeconds + elapsedSinceBlockSeconds;
  const ageFromUpdateTime = Math.floor(nowMs / 1_000) - snapshot.priceUpdatedAt;
  const age = Math.max(ageFromSnapshot, ageFromUpdateTime);
  return Number.isSafeInteger(age) ? age : null;
}

function exactPreparedPayloadMatches(prepared: PreparedOpenTrove, nowMs: number): boolean {
  try {
    if (!Number.isFinite(nowMs)) return false;
    const collateralWei = parseUnits18(prepared.collateralBtc);
    const debtWei = parseUnits18(prepared.requestedMusd);
    if (collateralWei === null || debtWei === null || collateralWei <= 0n || debtWei <= 0n) return false;

    const recomputedPlan = calculateOpenTrovePlan(prepared.snapshot, prepared.collateralBtc, prepared.requestedMusd, {
      nowMs,
      maxSnapshotAgeMs: MAX_READY_OPEN_TROVE_AGE_MS,
      maxPriceAgeSeconds: MAX_OPEN_TROVE_PRICE_AGE_SECONDS,
    });
    if (
      prepared.plan.status !== "calculated" || prepared.plan.allowed !== true ||
      prepared.plan.collateralWei !== collateralWei || prepared.plan.requestWei !== debtWei ||
      !sameOpenTroveReview(prepared, { ...prepared, plan: recomputedPlan })
    ) return false;

    if (prepared.gasEstimate <= 0n || prepared.gasEstimate > UINT256_MAX) return false;
    const expectedGasLimit = (prepared.gasEstimate * 120n + 99n) / 100n;
    if (expectedGasLimit <= 0n || expectedGasLimit > UINT256_MAX || prepared.gasLimit !== expectedGasLimit) return false;

    const expectedData = `${OPEN_TROVE_SELECTOR}${debtWei.toString(16).padStart(64, "0")}${ZERO_ADDRESS_WORD}${ZERO_ADDRESS_WORD}`;
    const tx = prepared.transaction;
    return tx.from.toLowerCase() === prepared.account.toLowerCase()
      && tx.to.toLowerCase() === MEZO_TESTNET_BORROWER_OPERATIONS.toLowerCase()
      && tx.data.toLowerCase() === expectedData.toLowerCase()
      && tx.value.toLowerCase() === `0x${collateralWei.toString(16)}`
      && tx.gas.toLowerCase() === `0x${expectedGasLimit.toString(16)}`;
  } catch {
    return false;
  }
}

/**
 * Synchronous tap-time gate for an already-prepared request. It intentionally
 * performs no reads or awaits before calling `send`, preserving mobile browser
 * user activation. All live checks and wallet-context reads must have completed
 * in the background before a ReadyOpenTrove is supplied.
 */
export function requestReadyOpenTrove(options: {
  ready: ReadyOpenTrove | null;
  currentKey: string;
  connectedAccount: string | null;
  nowMs?: number;
  send(tx: Record<string, string | undefined>, expected: WalletExpectation, onProviderCall?: () => void): Promise<string>;
  onProviderCall?: () => void;
}): ReadyOpenTroveRequestResult {
  const { ready, currentKey, connectedAccount } = options;
  if (!ready) return { status: "not-ready" };
  if (!connectedAccount || ready.key !== currentKey || ready.prepared.account.toLowerCase() !== connectedAccount.toLowerCase()) {
    return { status: "context-changed" };
  }
  const nowMs = options.nowMs ?? Date.now();
  const checkedAgeMs = nowMs - ready.checkedAtMs;
  const snapshotAgeMs = nowMs - ready.prepared.snapshot.observedAtMs;
  if (
    !Number.isFinite(nowMs) || !Number.isFinite(ready.checkedAtMs) || !Number.isFinite(ready.prepared.snapshot.observedAtMs) ||
    checkedAgeMs < -5_000 || snapshotAgeMs < -5_000 ||
    checkedAgeMs > MAX_READY_OPEN_TROVE_AGE_MS || snapshotAgeMs > MAX_READY_OPEN_TROVE_AGE_MS
  ) {
    return { status: "stale" };
  }
  const priceAgeAtTap = priceAgeAtTapSeconds(ready.prepared, nowMs);
  if (priceAgeAtTap === null || priceAgeAtTap < 0 || priceAgeAtTap > MAX_OPEN_TROVE_PRICE_AGE_SECONDS) {
    return { status: "stale" };
  }
  if (
    ready.prepared.snapshot.chainId !== MEZO_TESTNET_CHAIN_ID ||
    !Number.isSafeInteger(ready.prepared.snapshot.blockNumber) || ready.prepared.snapshot.blockNumber <= 0 ||
    ready.prepared.transaction.from.toLowerCase() !== ready.prepared.account.toLowerCase() ||
    !exactPreparedPayloadMatches(ready.prepared, nowMs)
  ) {
    return { status: "context-changed" };
  }

  // Keep this call synchronous: the injected provider request is made in the
  // same activation as the user's button tap; no async wallet check belongs here.
  try {
    const promise = options.send(
      { ...ready.prepared.transaction } as Record<string, string | undefined>,
      { account: ready.prepared.account, chainId: MEZO_TESTNET_CHAIN_ID },
      options.onProviderCall,
    );
    return { status: "requested", promise };
  } catch (error) {
    return { status: "requested", promise: Promise.reject(error) };
  }
}

export type OpenTroveConfirmationResult =
  | { status: "stale" }
  | { status: "changed"; fresh: PreparedOpenTrove }
  | { status: "ready"; fresh: PreparedOpenTrove };

/** Repeats all fresh protocol checks and confirms wallet context before enabling the final send tap. */
export async function recheckReviewedOpenTrove(options: {
  review: PreparedOpenTrove;
  recheck(): Promise<PreparedOpenTrove>;
  reviewIsCurrent(): boolean;
  checkWalletContext(expected: WalletExpectation): Promise<void>;
}): Promise<OpenTroveConfirmationResult> {
  const fresh = await options.recheck();
  if (!options.reviewIsCurrent()) return { status: "stale" };
  if (!sameOpenTroveReview(options.review, fresh)) return { status: "changed", fresh };
  await options.checkWalletContext({ account: fresh.account, chainId: MEZO_TESTNET_CHAIN_ID });
  if (!options.reviewIsCurrent()) return { status: "stale" };
  return { status: "ready", fresh };
}

/** The component renders this string in its visible role=alert error panel. */
export function formatOpenTroveActionError(error: unknown, phase: "preflight" | "wallet-context" | "wallet" = "wallet"): string {
  if (error instanceof OpenTrovePreflightError) return error.message;
  if (phase === "preflight") {
    const detail = error instanceof Error ? ` (${error.message.replace(/\s+/g, " ").trim().slice(0, 180)})` : "";
    return `The fresh Testnet preflight failed${detail}. No wallet request was made; automatic retry is in progress.`;
  }
  if (phase === "wallet-context") {
    return `${describeWalletError(error).message} No transaction request was sent; reconnect or switch to Mezo Testnet, then recheck.`;
  }
  return `${describeWalletError(error).message} No success is assumed; check the wallet and explorer before retrying.`;
}
