import { MEZO_TESTNET_CHAIN_ID } from "./openTrovePlanner";
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
    !Number.isFinite(ready.checkedAtMs) || !Number.isFinite(ready.prepared.snapshot.observedAtMs) ||
    checkedAgeMs < -5_000 || snapshotAgeMs < -5_000 ||
    checkedAgeMs > MAX_READY_OPEN_TROVE_AGE_MS || snapshotAgeMs > MAX_READY_OPEN_TROVE_AGE_MS
  ) {
    return { status: "stale" };
  }
  if (
    ready.prepared.snapshot.chainId !== MEZO_TESTNET_CHAIN_ID ||
    ready.prepared.transaction.from.toLowerCase() !== ready.prepared.account.toLowerCase()
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
