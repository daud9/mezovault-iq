import { MEZO_TESTNET_CHAIN_ID } from "./openTrovePlanner";
import {
  OpenTrovePreflightError,
  sameOpenTroveReview,
  type PreparedOpenTrove,
} from "./openTroveExecution";
import { describeWalletError, type WalletExpectation } from "./wallet";

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
    return `The fresh Testnet preflight failed${detail}. No wallet request was made; refresh the reads and review again.`;
  }
  if (phase === "wallet-context") {
    return `${describeWalletError(error).message} No transaction request was sent; reconnect or switch to Mezo Testnet, then recheck.`;
  }
  return `${describeWalletError(error).message} No success is assumed; check the wallet and explorer before retrying.`;
}
