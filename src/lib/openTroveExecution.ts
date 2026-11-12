import { MEZO_NETWORKS } from "../config/chains";
import { decodeUint256, encodeAddressWord, isAddress } from "./abi";
import { MEZO_TESTNET_SELECTORS } from "./mezoAbi";
import {
  calculateOpenTrovePlan,
  MEZO_TESTNET_BORROWER_OPERATIONS,
  MEZO_TESTNET_CHAIN_ID,
  OPEN_TROVE_SELECTOR,
  WAD,
  type OpenTroveLiveSnapshot,
  type OpenTrovePlan,
} from "./openTrovePlanner";
import { readOpenTroveSnapshot } from "./openTroveRead";
import type { RpcClient } from "./rpc";

/** The only parameters approved for the one-time Mezo Testnet test path. */
export const APPROVED_OPEN_TROVE_TEST = Object.freeze({
  account: "0x55039a1999313f5ff80c788cc676bf58fbb40bde" as const,
  collateralBtc: "0.05",
  collateralWei: 50_000_000_000_000_000n,
  requestedMusd: "3000",
  debtWei: 3_000n * WAD,
  borrowerOperations: MEZO_TESTNET_BORROWER_OPERATIONS,
  upperHint: "0x0000000000000000000000000000000000000000" as const,
  lowerHint: "0x0000000000000000000000000000000000000000" as const,
});

export interface ApprovedOpenTroveTransaction {
  readonly from: `0x${string}`;
  readonly to: `0x${string}`;
  readonly data: string;
  readonly value: string;
  readonly gas: string;
}

export interface PreparedApprovedOpenTrove {
  transaction: ApprovedOpenTroveTransaction;
  snapshot: OpenTroveLiveSnapshot;
  plan: OpenTrovePlan;
  gasEstimate: bigint;
}

export class OpenTrovePreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenTrovePreflightError";
  }
}

const NO_TROVE_STATUSES = [0n, 2n, 3n, 4n] as const;

function blockTag(blockNumber: number): string {
  return `0x${BigInt(blockNumber).toString(16)}`;
}

function quantity(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new OpenTrovePreflightError(`${label} could not be verified. Nothing was sent.`);
  }
  return BigInt(value);
}

function transactionData(): string {
  const debtWord = APPROVED_OPEN_TROVE_TEST.debtWei.toString(16).padStart(64, "0");
  const upperHintWord = encodeAddressWord(APPROVED_OPEN_TROVE_TEST.upperHint);
  const lowerHintWord = encodeAddressWord(APPROVED_OPEN_TROVE_TEST.lowerHint);
  return `${OPEN_TROVE_SELECTOR}${debtWord}${upperHintWord}${lowerHintWord}`;
}

/**
 * Re-runs the one-test live checks and exact-call simulation. This function is
 * read-only: it never invokes a wallet, signs, or submits a transaction.
 */
export async function prepareApprovedOpenTrove(options: {
  account: string | null;
  walletChainId: number | null;
  rpc: RpcClient;
  nowMs?: number;
}): Promise<PreparedApprovedOpenTrove> {
  const { account, walletChainId, rpc, nowMs = Date.now() } = options;
  const network = MEZO_NETWORKS.testnet;

  if (network.chainId !== MEZO_TESTNET_CHAIN_ID || network.key !== "testnet") {
    throw new OpenTrovePreflightError("This one-test action is configured only for Mezo Testnet. Nothing was sent.");
  }
  if (walletChainId !== MEZO_TESTNET_CHAIN_ID) {
    throw new OpenTrovePreflightError("The connected wallet is not on Mezo Testnet (chain 31611). Nothing was sent.");
  }
  if (!isAddress(account) || account.toLowerCase() !== APPROVED_OPEN_TROVE_TEST.account.toLowerCase()) {
    throw new OpenTrovePreflightError("The connected account does not match the wallet approved for this one-test action. Nothing was sent.");
  }

  const liveRead = await readOpenTroveSnapshot({ network, owner: APPROVED_OPEN_TROVE_TEST.account, rpc });
  if (liveRead.status !== "ok") {
    throw new OpenTrovePreflightError("Fresh Mezo Testnet protocol data could not be verified. The one-test action is blocked; nothing was sent.");
  }
  const snapshot = liveRead.snapshot;
  const plan = calculateOpenTrovePlan(
    snapshot,
    APPROVED_OPEN_TROVE_TEST.collateralBtc,
    APPROVED_OPEN_TROVE_TEST.requestedMusd,
    { nowMs, maxSnapshotAgeMs: 60_000, maxPriceAgeSeconds: 3_600 },
  );
  if (plan.status !== "calculated" || plan.allowed !== true) {
    throw new OpenTrovePreflightError("The fresh live protocol checks do not pass for 0.05 BTC collateral and 3,000 MUSD debt. The one-test action is blocked; nothing was sent.");
  }

  const troveManager = network.troveManager;
  if (!troveManager) {
    throw new OpenTrovePreflightError("The verified Mezo Testnet trove-status contract is unavailable. Nothing was sent.");
  }
  const pinnedBlock = blockTag(snapshot.blockNumber);
  const ownerWord = encodeAddressWord(APPROVED_OPEN_TROVE_TEST.account);
  let troveStatus: bigint;
  let existingCollateral: bigint;
  let existingDebt: bigint;
  try {
    const [statusHex, collateralHex, debtHex] = await Promise.all([
      rpc.call<string>("eth_call", [{ to: troveManager.address, data: `${MEZO_TESTNET_SELECTORS.troveManager.getTroveStatus}${ownerWord}` }, pinnedBlock]),
      rpc.call<string>("eth_call", [{ to: troveManager.address, data: `${MEZO_TESTNET_SELECTORS.troveManager.getTroveColl}${ownerWord}` }, pinnedBlock]),
      rpc.call<string>("eth_call", [{ to: troveManager.address, data: `${MEZO_TESTNET_SELECTORS.troveManager.getTroveDebt}${ownerWord}` }, pinnedBlock]),
    ]);
    troveStatus = decodeUint256(statusHex);
    existingCollateral = decodeUint256(collateralHex);
    existingDebt = decodeUint256(debtHex);
  } catch {
    throw new OpenTrovePreflightError("The wallet's current trove status could not be verified at the live snapshot block. The one-test action is blocked; nothing was sent.");
  }
  if (troveStatus === 1n || existingCollateral !== 0n || existingDebt !== 0n) {
    throw new OpenTrovePreflightError("This wallet already has an active or non-empty trove. Opening the approved test trove is blocked; nothing was sent.");
  }
  if (!NO_TROVE_STATUSES.includes(troveStatus as (typeof NO_TROVE_STATUSES)[number])) {
    throw new OpenTrovePreflightError("The wallet's trove status is not a recognized inactive state. The one-test action is blocked; nothing was sent.");
  }

  const unsignedTransaction = {
    from: APPROVED_OPEN_TROVE_TEST.account,
    to: APPROVED_OPEN_TROVE_TEST.borrowerOperations,
    data: transactionData(),
    value: `0x${APPROVED_OPEN_TROVE_TEST.collateralWei.toString(16)}`,
  } as const;

  let gasEstimate: bigint;
  try {
    gasEstimate = quantity(
      await rpc.call<string>("eth_estimateGas", [unsignedTransaction, pinnedBlock]),
      "The open-trove gas estimate",
    );
    if (gasEstimate <= 0n) {
      throw new OpenTrovePreflightError("The open-trove gas estimate was not positive. Nothing was sent.");
    }
    const simulationResult = await rpc.call<unknown>(
      "eth_call",
      [{ ...unsignedTransaction, gas: `0x${gasEstimate.toString(16)}` }, pinnedBlock],
    );
    if (typeof simulationResult !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(simulationResult)) {
      throw new OpenTrovePreflightError("The exact open-trove call returned an invalid simulation result. Nothing was sent.");
    }
  } catch (error) {
    if (error instanceof OpenTrovePreflightError) throw error;
    throw new OpenTrovePreflightError("The exact open-trove call simulation or fresh gas estimate failed. The one-test action is blocked; nothing was sent.");
  }

  return {
    transaction: Object.freeze({ ...unsignedTransaction, gas: `0x${gasEstimate.toString(16)}` }),
    snapshot,
    plan,
    gasEstimate,
  };
}
