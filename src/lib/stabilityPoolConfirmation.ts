import { MEZO_NETWORKS } from "../config/chains";
import { TESTNET_STABILITY_POOL } from "../config/stabilityPool";
import { encodeAddressWord } from "./abi";
import type { WalletExpectation } from "./wallet";
import { STABILITY_POOL_SELECTORS, type PreparedStabilityPoolAction } from "./stabilityPool";

export interface ReadyStabilityPoolAction {
  key: string;
  review: PreparedStabilityPoolAction;
  checkedAtMs: number;
}

export type ReadyStabilityPoolRequestResult =
  | { status: "not-ready" }
  | { status: "stale" }
  | { status: "context-changed" }
  | { status: "requested"; promise: Promise<string> };

export const MAX_READY_STABILITY_POOL_AGE_MS = 60_000;
const MAX_SNAPSHOT_AGE_MS = 120_000;
const CLOCK_SKEW_MS = 5_000;

/**
 * Synchronous final-tap gate for a Stability Pool request that has already passed
 * the exact snapshot, balance, allowance, gas, simulation, and wallet-context checks.
 */
export function requestReadyStabilityPoolAction(options: {
  ready: ReadyStabilityPoolAction | null;
  currentKey: string;
  connectedAccount: string | null;
  walletChainId: number | null;
  nowMs?: number;
  send(tx: Record<string, string | undefined>, expected: WalletExpectation, onProviderCall?: () => void): Promise<string>;
  onProviderCall?: () => void;
}): ReadyStabilityPoolRequestResult {
  const { ready, currentKey, connectedAccount, walletChainId } = options;
  if (!ready) return { status: "not-ready" };

  const { review } = ready;
  const account = connectedAccount?.toLowerCase();
  if (
    !account || ready.key !== currentKey || walletChainId !== TESTNET_STABILITY_POOL.chainId ||
    (review.action !== "approve" && review.action !== "deposit") ||
    review.account.toLowerCase() !== account || review.snapshot.wallet.toLowerCase() !== account ||
    review.snapshot.chainId !== TESTNET_STABILITY_POOL.chainId ||
    review.transaction.from.toLowerCase() !== account ||
    TESTNET_STABILITY_POOL.chainId !== MEZO_NETWORKS.testnet.chainId ||
    review.snapshot.implementation.toLowerCase() !== TESTNET_STABILITY_POOL.implementation.toLowerCase() ||
    review.snapshot.musdAddress.toLowerCase() !== MEZO_NETWORKS.testnet.musd?.address.toLowerCase() ||
    review.transaction.value !== "0x0" || review.amountWei <= 0n ||
    !Number.isSafeInteger(review.snapshot.blockNumber) || review.snapshot.blockNumber <= 0 ||
    !Number.isSafeInteger(review.snapshot.blockTimestamp) || review.snapshot.blockTimestamp <= 0 ||
    !/^0x[0-9a-fA-F]+$/.test(review.snapshot.blockTag) ||
    BigInt(review.snapshot.blockTag) !== BigInt(review.snapshot.blockNumber)
  ) {
    return { status: "context-changed" };
  }

  const nowMs = options.nowMs ?? Date.now();
  const reviewAgeMs = nowMs - review.reviewedAtMs;
  const checkedAgeMs = nowMs - ready.checkedAtMs;
  const snapshotAgeMs = nowMs - review.snapshot.blockTimestamp * 1_000;
  if (
    !Number.isFinite(nowMs) || !Number.isFinite(review.reviewedAtMs) || !Number.isFinite(ready.checkedAtMs) ||
    !Number.isFinite(snapshotAgeMs) ||
    reviewAgeMs < -CLOCK_SKEW_MS || checkedAgeMs < -CLOCK_SKEW_MS || snapshotAgeMs < -CLOCK_SKEW_MS ||
    reviewAgeMs > MAX_READY_STABILITY_POOL_AGE_MS || checkedAgeMs > MAX_READY_STABILITY_POOL_AGE_MS ||
    snapshotAgeMs > MAX_SNAPSHOT_AGE_MS
  ) {
    return { status: "stale" };
  }

  const expectedTo = review.action === "approve" ? review.snapshot.musdAddress : TESTNET_STABILITY_POOL.proxy;
  const amountWord = review.amountWei.toString(16).padStart(64, "0");
  const expectedData = review.action === "approve"
    ? `${STABILITY_POOL_SELECTORS.approve}${encodeAddressWord(TESTNET_STABILITY_POOL.proxy)}${amountWord}`
    : `${STABILITY_POOL_SELECTORS.provideToSP}${amountWord}`;
  const allowanceMatchesAction = review.action === "approve"
    ? review.snapshot.allowance < review.amountWei
    : review.snapshot.allowance >= review.amountWei;
  if (
    review.transaction.to.toLowerCase() !== expectedTo.toLowerCase() || !allowanceMatchesAction ||
    review.transaction.data.toLowerCase() !== expectedData.toLowerCase() ||
    !/^0x[0-9a-fA-F]+$/.test(review.transaction.gas) || BigInt(review.transaction.gas) !== review.gasLimit ||
    review.gasEstimate <= 0n || review.gasLimit <= 0n ||
    review.gasLimit !== (review.gasEstimate * 120n + 99n) / 100n
  ) {
    return { status: "context-changed" };
  }

  try {
    const promise = options.send(
      { ...review.transaction } as Record<string, string | undefined>,
      { account: review.account, chainId: TESTNET_STABILITY_POOL.chainId },
      options.onProviderCall,
    );
    return { status: "requested", promise };
  } catch (error) {
    return { status: "requested", promise: Promise.reject(error) };
  }
}
