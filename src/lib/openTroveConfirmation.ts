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
  | { status: "submitted"; fresh: PreparedOpenTrove; hash: string };

/** Final button path: repeat checks, compare the reviewed request, then hand off only after explicit confirmation. */
export async function confirmReviewedOpenTrove(options: {
  review: PreparedOpenTrove;
  recheck(): Promise<PreparedOpenTrove>;
  reviewIsCurrent(): boolean;
  sendTransaction(tx: Record<string, string | undefined>, expected?: WalletExpectation): Promise<string>;
  onWalletRequest?(): void;
}): Promise<OpenTroveConfirmationResult> {
  const fresh = await options.recheck();
  if (!options.reviewIsCurrent()) return { status: "stale" };
  if (!sameOpenTroveReview(options.review, fresh)) return { status: "changed", fresh };

  options.onWalletRequest?.();
  const hash = await options.sendTransaction(
    { ...fresh.transaction },
    { account: fresh.account, chainId: MEZO_TESTNET_CHAIN_ID },
  );
  return { status: "submitted", fresh, hash };
}

/** The component renders this string in its visible role=alert error panel. */
export function formatOpenTroveActionError(error: unknown, phase: "preflight" | "wallet" = "wallet"): string {
  if (error instanceof OpenTrovePreflightError) return error.message;
  if (phase === "preflight") {
    const detail = error instanceof Error ? ` (${error.message.replace(/\s+/g, " ").trim().slice(0, 180)})` : "";
    return `The fresh Testnet preflight failed${detail}. No wallet request was made; refresh the reads and review again.`;
  }
  return `${describeWalletError(error).message} No success is assumed; check the wallet and explorer before retrying.`;
}
