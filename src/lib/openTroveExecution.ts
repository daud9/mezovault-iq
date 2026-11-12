import { MEZO_NETWORKS } from "../config/chains";
import { decodeUint256, encodeAddressWord, isAddress } from "./abi";
import { MEZO_TESTNET_SELECTORS } from "./mezoAbi";
import {
  calculateOpenTrovePlan,
  MEZO_TESTNET_BORROWER_OPERATIONS,
  MEZO_TESTNET_CHAIN_ID,
  OPEN_TROVE_SELECTOR,
  UINT256_MAX,
  parseUnits18,
  type OpenTroveLiveSnapshot,
  type OpenTrovePlan,
} from "./openTrovePlanner";
import { readOpenTroveSnapshot } from "./openTroveRead";
import type { RpcClient } from "./rpc";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const NO_TROVE_STATUSES = [0n, 2n, 3n, 4n] as const;

export interface OpenTroveTransaction {
  readonly from: `0x${string}`;
  readonly to: `0x${string}`;
  readonly data: string;
  readonly value: string;
  readonly gas: string;
}

export interface PreparedOpenTrove {
  transaction: OpenTroveTransaction;
  account: `0x${string}`;
  collateralBtc: string;
  requestedMusd: string;
  snapshot: OpenTroveLiveSnapshot;
  plan: OpenTrovePlan;
  gasEstimate: bigint;
  gasLimit: bigint;
  reviewedAtMs: number;
}

export class OpenTrovePreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenTrovePreflightError";
  }
}

function blockTag(blockNumber: number): string {
  return `0x${BigInt(blockNumber).toString(16)}`;
}

function quantity(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new OpenTrovePreflightError(`${label} could not be verified. No wallet request was made.`);
  }
  return BigInt(value);
}

function encodeOpenTroveCall(debtWei: bigint): string {
  if (debtWei <= 0n || debtWei > UINT256_MAX) {
    throw new OpenTrovePreflightError("The requested debt is outside the contract's uint256 range. No wallet request was made.");
  }
  return `${OPEN_TROVE_SELECTOR}${debtWei.toString(16).padStart(64, "0")}${encodeAddressWord(ZERO_ADDRESS)}${encodeAddressWord(ZERO_ADDRESS)}`;
}

/**
 * Re-reads and simulates the exact wallet-specific openTrove call at one fresh
 * Mezo Testnet block. This function only performs JSON-RPC reads; it has no
 * wallet provider and never signs or submits a transaction.
 */
export async function prepareOpenTrove(options: {
  account: string | null;
  walletChainId: number | null;
  collateralBtc: string;
  requestedMusd: string;
  rpc: RpcClient;
  nowMs?: number;
}): Promise<PreparedOpenTrove> {
  const { account, walletChainId, collateralBtc, requestedMusd, rpc } = options;
  const network = MEZO_NETWORKS.testnet;

  if (network.chainId !== MEZO_TESTNET_CHAIN_ID || network.key !== "testnet" || !network.borrowerOperations) {
    throw new OpenTrovePreflightError("The verified openTrove contract is configured only for Mezo Testnet. No wallet request was made.");
  }
  if (walletChainId !== MEZO_TESTNET_CHAIN_ID) {
    throw new OpenTrovePreflightError("The connected wallet is not on Mezo Testnet (chain 31611). No wallet request was made.");
  }
  if (!isAddress(account)) {
    throw new OpenTrovePreflightError("Connect a valid wallet account before opening a Trove. No wallet request was made.");
  }
  const collateralWei = parseUnits18(collateralBtc);
  const requestedDebtWei = parseUnits18(requestedMusd);
  if (collateralWei === null || requestedDebtWei === null || collateralWei <= 0n || requestedDebtWei <= 0n || collateralWei > UINT256_MAX || requestedDebtWei > UINT256_MAX) {
    throw new OpenTrovePreflightError("Enter positive BTC and MUSD amounts with at most 18 decimal places and within the contract's uint256 range. No wallet request was made.");
  }

  const liveRead = await readOpenTroveSnapshot({ network, owner: account, rpc });
  if (liveRead.status !== "ok") {
    throw new OpenTrovePreflightError(`Fresh Mezo Testnet protocol data could not be verified (${liveRead.status === "error" ? liveRead.message : liveRead.status}). No wallet request was made.`);
  }
  const snapshot = liveRead.snapshot;
  const plan = calculateOpenTrovePlan(snapshot, collateralBtc, requestedMusd, {
    nowMs: options.nowMs ?? Date.now(),
    maxSnapshotAgeMs: 60_000,
    maxPriceAgeSeconds: 3_600,
  });
  if (plan.status !== "calculated") {
    throw new OpenTrovePreflightError(`${plan.reason ?? "The live open-Trove calculation is unavailable."} No wallet request was made.`);
  }
  if (plan.allowed !== true || plan.collateralWei === undefined || plan.requestWei === undefined) {
    throw new OpenTrovePreflightError("The fresh live collateral, minimum-debt, ICR, or system-mode checks do not pass for these planner values. No wallet request was made.");
  }

  const troveManager = network.troveManager;
  if (!troveManager) {
    throw new OpenTrovePreflightError("The verified Mezo Testnet TroveManager is unavailable. No wallet request was made.");
  }
  const pinnedBlock = blockTag(snapshot.blockNumber);
  const ownerWord = encodeAddressWord(account);
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
    throw new OpenTrovePreflightError("The wallet's Trove status, collateral, and debt could not be verified at the live snapshot block. No wallet request was made.");
  }
  if (troveStatus === 1n || existingCollateral !== 0n || existingDebt !== 0n) {
    throw new OpenTrovePreflightError("This wallet already has an active or non-empty Trove. A second Trove cannot be opened; no wallet request was made.");
  }
  if (!NO_TROVE_STATUSES.includes(troveStatus as (typeof NO_TROVE_STATUSES)[number])) {
    throw new OpenTrovePreflightError("The wallet's Trove status is not a recognized inactive state. No wallet request was made.");
  }

  const unsignedTransaction = {
    from: account as `0x${string}`,
    to: MEZO_TESTNET_BORROWER_OPERATIONS as `0x${string}`,
    data: encodeOpenTroveCall(plan.requestWei),
    value: `0x${plan.collateralWei.toString(16)}`,
  } as const;

  let gasEstimate: bigint;
  let gasLimit: bigint;
  try {
    gasEstimate = quantity(
      await rpc.call<string>("eth_estimateGas", [unsignedTransaction, pinnedBlock]),
      "The openTrove gas estimate",
    );
    if (gasEstimate <= 0n || gasEstimate > UINT256_MAX) {
      throw new OpenTrovePreflightError("The openTrove gas estimate was outside the valid range. No wallet request was made.");
    }
    gasLimit = (gasEstimate * 120n + 99n) / 100n;
    if (gasLimit > UINT256_MAX) {
      throw new OpenTrovePreflightError("The buffered gas limit was outside the valid range. No wallet request was made.");
    }
    const simulationResult = await rpc.call<unknown>(
      "eth_call",
      [{ ...unsignedTransaction, gas: `0x${gasLimit.toString(16)}` }, pinnedBlock],
    );
    if (typeof simulationResult !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(simulationResult)) {
      throw new OpenTrovePreflightError("The exact openTrove simulation returned invalid data. No wallet request was made.");
    }
  } catch (error) {
    if (error instanceof OpenTrovePreflightError) throw error;
    throw new OpenTrovePreflightError("The exact openTrove call reverted or its fresh gas estimate/simulation failed. No wallet request was made.");
  }

  return {
    transaction: Object.freeze({ ...unsignedTransaction, gas: `0x${gasLimit.toString(16)}` }),
    account: account as `0x${string}`,
    collateralBtc,
    requestedMusd,
    snapshot,
    plan,
    gasEstimate,
    gasLimit,
    reviewedAtMs: Date.now(),
  };
}

/**
 * A final wallet click repeats the complete preflight. Only open the injected wallet
 * when the just-refreshed transaction and the previously displayed preview agree.
 */
export function sameOpenTroveReview(a: PreparedOpenTrove, b: PreparedOpenTrove): boolean {
  const snapshotKeys = [
    "chainId", "mode", "minNetDebtWei", "borrowingRateWei", "gasCompensationWei",
    "mcrWei", "ccrWei", "btcUsdWei", "feeExempt", "systemCollateralBtcWei", "systemDebtWei",
  ] as const;
  if (!snapshotKeys.every((key) => a.snapshot[key] === b.snapshot[key])) return false;
  const planKeys = [
    "status", "collateralWei", "requestWei", "feeWei", "netDebtWei", "reserveWei",
    "compositeDebtWei", "collateralValueWei", "icrBasisPoints", "icrPass", "minDebtPass",
    "postOpenTcrBasisPoints", "postOpenTcrPass", "allowed",
  ] as const;
  if (!planKeys.every((key) => a.plan[key] === b.plan[key])) return false;
  return a.account.toLowerCase() === b.account.toLowerCase()
    && a.collateralBtc === b.collateralBtc
    && a.requestedMusd === b.requestedMusd
    && a.gasEstimate === b.gasEstimate
    && a.gasLimit === b.gasLimit
    && a.transaction.from.toLowerCase() === b.transaction.from.toLowerCase()
    && a.transaction.to.toLowerCase() === b.transaction.to.toLowerCase()
    && a.transaction.data.toLowerCase() === b.transaction.data.toLowerCase()
    && BigInt(a.transaction.value) === BigInt(b.transaction.value)
    && BigInt(a.transaction.gas) === BigInt(b.transaction.gas);
}
