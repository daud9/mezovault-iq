import { isAddress } from "./abi";
import { toEventSelector } from "viem";
import type { AddCollateralTransaction } from "./addCollateralExecution";
import type { RpcClient } from "./rpc";

const TROVE_UPDATED_TOPIC = toEventSelector("TroveUpdated(address,uint256,uint256,uint256,uint256,uint16,uint256,uint8)");
const ADJUST_TROVE_OPERATION = 2n;

export type AddCollateralReceiptResult =
  | { status: "pending" }
  | { status: "confirmed"; blockNumber: number }
  | { status: "reverted"; blockNumber: number };

export class AddCollateralReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AddCollateralReceiptError";
  }
}

interface RpcReceipt {
  transactionHash?: unknown;
  from?: unknown;
  to?: unknown;
  status?: unknown;
  blockNumber?: unknown;
  logs?: unknown;
}

interface RpcTransaction {
  hash?: unknown;
  from?: unknown;
  to?: unknown;
  input?: unknown;
  data?: unknown;
  value?: unknown;
  gas?: unknown;
}

function validHash(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function parseHex(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new AddCollateralReceiptError(`The transaction ${label} could not be verified; confirmation is unknown.`);
  }
  return BigInt(value);
}

function sameAddress(actual: unknown, expected: string): boolean {
  return isAddress(actual) && actual.toLowerCase() === expected.toLowerCase();
}

function hasMatchingTroveUpdatedLog(logs: unknown, expected: AddCollateralTransaction): boolean {
  if (!Array.isArray(logs)) return false;
  const borrowerTopic = `0x${expected.from.slice(2).toLowerCase().padStart(64, "0")}`;
  return logs.some((value) => {
    if (value === null || typeof value !== "object") return false;
    const log = value as { address?: unknown; topics?: unknown; data?: unknown };
    if (!sameAddress(log.address, expected.to) || !Array.isArray(log.topics) || log.topics.length !== 2) return false;
    if (typeof log.topics[0] !== "string" || log.topics[0].toLowerCase() !== TROVE_UPDATED_TOPIC.toLowerCase()) return false;
    if (typeof log.topics[1] !== "string" || log.topics[1].toLowerCase() !== borrowerTopic) return false;
    if (typeof log.data !== "string" || !/^0x[0-9a-fA-F]{448}$/.test(log.data)) return false;
    const operationWord = log.data.slice(-64);
    return BigInt(`0x${operationWord}`) === ADJUST_TROVE_OPERATION;
  });
}

/** Verify the exact addColl transaction and its successful borrower update using read-only RPC. */
export async function readAddCollateralReceipt(options: {
  rpc: RpcClient;
  hash: string;
  expected: AddCollateralTransaction;
}): Promise<AddCollateralReceiptResult> {
  const { rpc, hash, expected } = options;
  if (!validHash(hash)) throw new AddCollateralReceiptError("The wallet returned an invalid transaction hash; confirmation is unknown.");

  let receipt: RpcReceipt | null;
  try {
    receipt = await rpc.call<RpcReceipt | null>("eth_getTransactionReceipt", [hash]);
  } catch {
    throw new AddCollateralReceiptError("The transaction receipt could not be read; confirmation is unknown.");
  }
  if (receipt === null) return { status: "pending" };
  if (typeof receipt !== "object") throw new AddCollateralReceiptError("The RPC returned an invalid receipt; confirmation is unknown.");
  if (!validHash(receipt.transactionHash) || receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) {
    throw new AddCollateralReceiptError("The receipt hash does not match the wallet transaction; confirmation is unknown.");
  }
  if (!sameAddress(receipt.from, expected.from) || !sameAddress(receipt.to, expected.to)) {
    throw new AddCollateralReceiptError("The receipt sender or target does not match the reviewed addColl request; confirmation is unknown.");
  }

  let transaction: RpcTransaction | null;
  try {
    transaction = await rpc.call<RpcTransaction | null>("eth_getTransactionByHash", [hash]);
  } catch {
    throw new AddCollateralReceiptError("The mined transaction details could not be read; confirmation is unknown.");
  }
  if (!transaction || typeof transaction !== "object") {
    throw new AddCollateralReceiptError("The mined transaction details are unavailable; confirmation is unknown.");
  }
  const input = typeof transaction.input === "string" ? transaction.input : transaction.data;
  const transactionValue = parseHex(transaction.value, "native value");
  const transactionGas = parseHex(transaction.gas, "gas limit");
  if (!validHash(transaction.hash) || transaction.hash.toLowerCase() !== hash.toLowerCase()
    || !sameAddress(transaction.from, expected.from)
    || !sameAddress(transaction.to, expected.to)
    || typeof input !== "string" || input.toLowerCase() !== expected.data.toLowerCase()
    || transactionValue !== BigInt(expected.value)
    || transactionGas !== BigInt(expected.gas)) {
    throw new AddCollateralReceiptError("The mined transaction does not match the reviewed sender, contract, addColl calldata, BTC value, or gas limit; confirmation is unknown.");
  }

  const status = parseHex(receipt.status, "receipt status");
  const block = parseHex(receipt.blockNumber, "receipt block number");
  if (block <= 0n || block > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new AddCollateralReceiptError("The receipt block number is invalid; confirmation is unknown.");
  }
  if (status !== 0n && status !== 1n) {
    throw new AddCollateralReceiptError("The receipt status is unrecognized; confirmation is unknown.");
  }
  if (status === 1n && !hasMatchingTroveUpdatedLog(receipt.logs, expected)) {
    throw new AddCollateralReceiptError("The successful receipt does not contain a matching TroveUpdated(adjustTrove) event for this wallet; collateral addition is not confirmed.");
  }
  return status === 1n
    ? { status: "confirmed", blockNumber: Number(block) }
    : { status: "reverted", blockNumber: Number(block) };
}
