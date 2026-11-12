import { MEZO_NETWORKS } from "../config/chains";
import { encodeAddressWord, isAddress } from "./abi";
import { MEZO_TESTNET_SELECTORS } from "./mezoAbi";
import { readLoan, type LoanResult } from "./loan";
import { MEZO_TESTNET_CHAIN_ID, parseUnits18, UINT256_MAX } from "./openTrovePlanner";
import type { RpcClient } from "./rpc";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const ADD_COLL_SELECTOR = MEZO_TESTNET_SELECTORS.borrowerOperations.addColl;

export interface AddCollateralTransaction {
  readonly from: `0x${string}`;
  readonly to: `0x${string}`;
  readonly data: string;
  readonly value: string;
  readonly gas: string;
}

export interface PreparedAddCollateral {
  transaction: AddCollateralTransaction;
  account: `0x${string}`;
  collateralBtc: string;
  collateralWei: bigint;
  existingCollateralWei: bigint;
  existingDebtWei: bigint;
  blockNumber: number;
  blockTimestamp: number;
  gasEstimate: bigint;
  gasLimit: bigint;
  reviewedAtMs: number;
}

export class AddCollateralPreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AddCollateralPreflightError";
  }
}

function blockTag(blockNumber: number): string {
  return `0x${BigInt(blockNumber).toString(16)}`;
}

function quantity(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new AddCollateralPreflightError(`${label} could not be verified. No wallet request was made.`);
  }
  return BigInt(value);
}

function encodeAddCollCall(): string {
  return `${ADD_COLL_SELECTOR}${encodeAddressWord(ZERO_ADDRESS)}${encodeAddressWord(ZERO_ADDRESS)}`;
}

function assertContractCode(code: unknown): void {
  if (typeof code !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code)) {
    throw new AddCollateralPreflightError("BorrowerOperations has no valid contract code at the checked block. No wallet request was made.");
  }
}

/**
 * Re-reads the connected wallet's existing Trove at a recent pinned Mezo Testnet
 * block, then estimates and simulates the exact payable addColl call. This module
 * has no wallet provider and never signs or submits a transaction.
 */
export async function prepareAddCollateral(options: {
  account: string | null;
  walletChainId: number | null;
  collateralBtc: string;
  rpc: RpcClient;
  nowMs?: number;
}): Promise<PreparedAddCollateral> {
  const { account, walletChainId, collateralBtc, rpc } = options;
  const network = MEZO_NETWORKS.testnet;
  const nowMs = options.nowMs ?? Date.now();

  if (network.key !== "testnet" || network.chainId !== MEZO_TESTNET_CHAIN_ID || !network.borrowerOperations || !network.troveManager) {
    throw new AddCollateralPreflightError("The verified addColl path is configured only for Mezo Testnet. No wallet request was made.");
  }
  if (walletChainId !== MEZO_TESTNET_CHAIN_ID) {
    throw new AddCollateralPreflightError("The connected wallet is not on Mezo Testnet (chain 31611). No wallet request was made.");
  }
  if (!isAddress(account)) {
    throw new AddCollateralPreflightError("Connect a valid wallet account before adding collateral. No wallet request was made.");
  }

  const collateralWei = parseUnits18(collateralBtc);
  if (collateralWei === null || collateralWei <= 0n || collateralWei > UINT256_MAX) {
    throw new AddCollateralPreflightError("Enter a positive BTC amount with at most 18 decimal places and within the contract's uint256 range. No wallet request was made.");
  }

  const position: LoanResult = await readLoan({
    network,
    owner: account,
    rpc,
    now: () => new Date(nowMs),
  });
  if (position.status !== "ok") {
    const detail = position.status === "error"
      ? position.message
      : position.status === "wrong-network"
        ? `RPC chain ${position.actualChainId ?? "unknown"}; expected ${position.expectedChainId}`
        : position.reason;
    throw new AddCollateralPreflightError(`The current Testnet Trove could not be verified (${detail}). No wallet request was made.`);
  }
  if (!position.hasLoan || position.collateralRaw <= 0n || position.debtRaw <= 0n) {
    throw new AddCollateralPreflightError("This wallet has no verified active Trove to add collateral to. No wallet request was made.");
  }
  if (position.collateralRaw > UINT256_MAX - collateralWei) {
    throw new AddCollateralPreflightError("The requested addition would overflow the Trove collateral range. No wallet request was made.");
  }

  const blockAgeMs = nowMs - position.blockTimestamp * 1_000;
  if (!Number.isFinite(nowMs) || blockAgeMs < -5_000 || blockAgeMs > 60_000) {
    throw new AddCollateralPreflightError("The Trove state read is stale or has an invalid timestamp. Refresh and prepare a new review. No wallet request was made.");
  }
  const pinnedBlock = blockTag(position.blockNumber);
  try {
    const code = await rpc.call<string>("eth_getCode", [network.borrowerOperations.address, pinnedBlock]);
    assertContractCode(code);
  } catch (error) {
    if (error instanceof AddCollateralPreflightError) throw error;
    throw new AddCollateralPreflightError("BorrowerOperations code could not be verified at the Trove snapshot block. No wallet request was made.");
  }

  const unsignedTransaction = {
    from: account as `0x${string}`,
    to: network.borrowerOperations.address as `0x${string}`,
    data: encodeAddCollCall(),
    value: `0x${collateralWei.toString(16)}`,
  } as const;

  let gasEstimate: bigint;
  let gasLimit: bigint;
  try {
    gasEstimate = quantity(
      await rpc.call<string>("eth_estimateGas", [unsignedTransaction, pinnedBlock]),
      "The addColl gas estimate",
    );
    if (gasEstimate <= 0n || gasEstimate > UINT256_MAX) {
      throw new AddCollateralPreflightError("The addColl gas estimate was outside the valid range. No wallet request was made.");
    }
    gasLimit = (gasEstimate * 120n + 99n) / 100n;
    if (gasLimit > UINT256_MAX) {
      throw new AddCollateralPreflightError("The buffered gas limit was outside the valid range. No wallet request was made.");
    }
    const simulationResult = await rpc.call<unknown>(
      "eth_call",
      [{ ...unsignedTransaction, gas: `0x${gasLimit.toString(16)}` }, pinnedBlock],
    );
    if (typeof simulationResult !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(simulationResult)) {
      throw new AddCollateralPreflightError("The exact addColl simulation returned invalid data. No wallet request was made.");
    }
  } catch (error) {
    if (error instanceof AddCollateralPreflightError) throw error;
    throw new AddCollateralPreflightError("The exact addColl call reverted or its fresh gas estimate/simulation failed. No wallet request was made.");
  }

  return {
    transaction: Object.freeze({ ...unsignedTransaction, gas: `0x${gasLimit.toString(16)}` }),
    account: account as `0x${string}`,
    collateralBtc: collateralBtc.trim(),
    collateralWei,
    existingCollateralWei: position.collateralRaw,
    existingDebtWei: position.debtRaw,
    blockNumber: position.blockNumber,
    blockTimestamp: position.blockTimestamp,
    gasEstimate,
    gasLimit,
    reviewedAtMs: nowMs,
  };
}

/** Final wallet click must use the same amount, existing position, calldata, and gas review. */
export function sameAddCollateralReview(a: PreparedAddCollateral, b: PreparedAddCollateral): boolean {
  return a.account.toLowerCase() === b.account.toLowerCase()
    && a.collateralWei === b.collateralWei
    && a.existingCollateralWei === b.existingCollateralWei
    && a.existingDebtWei === b.existingDebtWei
    && a.gasEstimate === b.gasEstimate
    && a.gasLimit === b.gasLimit
    && a.transaction.from.toLowerCase() === b.transaction.from.toLowerCase()
    && a.transaction.to.toLowerCase() === b.transaction.to.toLowerCase()
    && a.transaction.data.toLowerCase() === b.transaction.data.toLowerCase()
    && BigInt(a.transaction.value) === BigInt(b.transaction.value)
    && BigInt(a.transaction.gas) === BigInt(b.transaction.gas);
}

/** Exported for exact-calldata tests; both hints intentionally request protocol fallback search. */
export function encodeAddCollateralCalldata(): string {
  return encodeAddCollCall();
}
