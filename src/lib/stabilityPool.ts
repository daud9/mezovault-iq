import { toEventSelector, toFunctionSelector } from "viem";
import type { MezoNetworkConfig } from "../config/chains";
import { TESTNET_STABILITY_POOL } from "../config/stabilityPool";
import { decodeAbiString, decodeUint256, encodeAddressWord, isAddress } from "./abi";
import { parseAmount } from "./transfer";
import type { RpcClient } from "./rpc";
import { parseChainId } from "./network";

export const STABILITY_POOL_SELECTORS = {
  approve: toFunctionSelector("approve(address,uint256)"),
  provideToSP: toFunctionSelector("provideToSP(uint256)"),
  musd: toFunctionSelector("musd()"),
  getCompoundedMUSDDeposit: toFunctionSelector("getCompoundedMUSDDeposit(address)"),
  getDepositorCollateralGain: toFunctionSelector("getDepositorCollateralGain(address)"),
  getTotalMUSDDeposits: toFunctionSelector("getTotalMUSDDeposits()"),
  getCollateralBalance: toFunctionSelector("getCollateralBalance()"),
  balanceOf: toFunctionSelector("balanceOf(address)"),
  allowance: toFunctionSelector("allowance(address,address)"),
  decimals: toFunctionSelector("decimals()"),
  symbol: toFunctionSelector("symbol()"),
} as const;

const APPROVAL_TOPIC = toEventSelector("Approval(address,address,uint256)");
const TRANSFER_TOPIC = toEventSelector("Transfer(address,address,uint256)");
const USER_DEPOSIT_CHANGED_TOPIC = toEventSelector("UserDepositChanged(address,uint256)");
const COLLATERAL_GAIN_WITHDRAWN_TOPIC = toEventSelector("CollateralGainWithdrawn(address,uint256,uint256)");
const UINT256_MAX = (1n << 256n) - 1n;
const SNAPSHOT_MAX_AGE_SECONDS = 120;
const ZERO = "0x0000000000000000000000000000000000000000";

export class StabilityPoolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StabilityPoolError";
  }
}

export interface StabilityPoolSnapshot {
  chainId: number;
  blockNumber: number;
  blockTag: `0x${string}`;
  blockTimestamp: number;
  wallet: `0x${string}`;
  implementation: `0x${string}`;
  musdAddress: `0x${string}`;
  decimals: number;
  symbol: "MUSD";
  musdBalance: bigint;
  allowance: bigint;
  compoundedDeposit: bigint;
  collateralGain: bigint;
  totalMUSDDeposits: bigint;
  poolCollateral: bigint;
}

export interface StabilityPoolTransaction {
  readonly from: `0x${string}`;
  readonly to: `0x${string}`;
  readonly data: `0x${string}`;
  readonly value: "0x0";
  readonly gas: `0x${string}`;
}

export interface PreparedStabilityPoolAction {
  action: "approve" | "deposit";
  account: `0x${string}`;
  amount: string;
  amountWei: bigint;
  snapshot: StabilityPoolSnapshot;
  transaction: StabilityPoolTransaction;
  gasEstimate: bigint;
  gasLimit: bigint;
  reviewedAtMs: number;
}

function fail(message: string): never {
  throw new StabilityPoolError(message);
}

function parseHex(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) {
    return fail(`${label} could not be verified. No wallet request was made.`);
  }
  return BigInt(value);
}

function decodeAddressWord(hex: string, label: string): `0x${string}` {
  if (typeof hex !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    return fail(`${label} returned an invalid ABI address. No wallet request was made.`);
  }
  const word = hex.slice(2);
  if (!/^0{24}/i.test(word)) return fail(`${label} returned a malformed ABI address. No wallet request was made.`);
  const address = `0x${word.slice(-40)}`;
  if (!isAddress(address) || address.toLowerCase() === ZERO) {
    return fail(`${label} returned a zero or invalid address. No wallet request was made.`);
  }
  return address;
}

function checkedCode(value: unknown, label: string): void {
  if (typeof value !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(value)) {
    fail(`${label} has no verifiable contract code at the snapshot block. No wallet request was made.`);
  }
}

function callAt(rpc: RpcClient, to: string, data: string, blockTag: `0x${string}`): Promise<string> {
  return rpc.call<string>("eth_call", [{ to, data }, blockTag]);
}

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Reads pool accounting, MUSD balance/allowance, and the EIP-1967 implementation
 * slot at one recent Mezo Testnet block. This is read-only and fails closed.
 */
export async function readStabilityPoolSnapshot(options: {
  network: MezoNetworkConfig;
  owner: string;
  rpc: RpcClient;
  nowMs?: number;
}): Promise<StabilityPoolSnapshot> {
  const { network, rpc } = options;
  if (network.key !== "testnet" || network.chainId !== TESTNET_STABILITY_POOL.chainId || !network.musd) {
    return fail("The verified Stability Pool route is configured only for Mezo Testnet (chain 31611). No wallet request was made.");
  }
  if (!isAddress(options.owner)) return fail("Connect a valid wallet account before reading the Stability Pool. No wallet request was made.");
  const wallet = options.owner as `0x${string}`;
  const chainId = parseChainId(await rpc.call<string>("eth_chainId"));
  if (chainId !== TESTNET_STABILITY_POOL.chainId) return fail(`The RPC reports chain ${chainId ?? "unknown"}, not Mezo Testnet (31611). No wallet request was made.`);

  const blockNumberBig = parseHex(await rpc.call<string>("eth_blockNumber"), "The snapshot block number");
  if (blockNumberBig <= 0n || blockNumberBig > BigInt(Number.MAX_SAFE_INTEGER)) return fail("The RPC returned an invalid snapshot block. No wallet request was made.");
  const blockTag = `0x${blockNumberBig.toString(16)}` as const;
  const header = await rpc.call<{ number?: unknown; timestamp?: unknown } | null>("eth_getBlockByNumber", [blockTag, false]);
  if (!header || typeof header !== "object") return fail("The snapshot block header is unavailable. No wallet request was made.");
  const headerNumber = parseHex(header.number, "The snapshot header number");
  const timestampBig = parseHex(header.timestamp, "The snapshot timestamp");
  if (headerNumber !== blockNumberBig || timestampBig <= 0n || timestampBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    return fail("The RPC returned an inconsistent snapshot block header. No wallet request was made.");
  }
  const blockTimestamp = Number(timestampBig);
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1_000);
  const age = nowSeconds - blockTimestamp;
  if (age < 0 || age > SNAPSHOT_MAX_AGE_SECONDS) return fail("The Stability Pool snapshot is stale or has an invalid timestamp. Refresh before continuing.");
  const tag = blockTag;
  const proxy = TESTNET_STABILITY_POOL.proxy;
  const implementation = TESTNET_STABILITY_POOL.implementation;
  const token = network.musd.address;

  const [proxyCode, implementationCode, tokenCode, rawImplementation] = await Promise.all([
    rpc.call<string>("eth_getCode", [proxy, tag]),
    rpc.call<string>("eth_getCode", [implementation, tag]),
    rpc.call<string>("eth_getCode", [token, tag]),
    rpc.call<string>("eth_getStorageAt", [proxy, TESTNET_STABILITY_POOL.eip1967ImplementationSlot, tag]),
  ]);
  checkedCode(proxyCode, "Stability Pool proxy");
  checkedCode(implementationCode, "Expected Stability Pool implementation");
  checkedCode(tokenCode, "Testnet MUSD token");
  if (typeof rawImplementation !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(rawImplementation)) {
    return fail("The Stability Pool EIP-1967 implementation slot could not be verified. No wallet request was made.");
  }
  const slotImplementation = decodeAddressWord(rawImplementation, "EIP-1967 implementation slot");
  if (!sameAddress(slotImplementation, implementation)) return fail("The Stability Pool proxy now points to a different implementation than the verified Testnet deployment. The route is disabled.");

  const accountWord = encodeAddressWord(wallet);
  const [poolMusdHex, decimalsHex, symbolHex, balanceHex, allowanceHex, compoundedHex, gainHex, totalHex, collateralHex] = await Promise.all([
    callAt(rpc, proxy, STABILITY_POOL_SELECTORS.musd, tag),
    callAt(rpc, token, STABILITY_POOL_SELECTORS.decimals, tag),
    callAt(rpc, token, STABILITY_POOL_SELECTORS.symbol, tag),
    callAt(rpc, token, `${STABILITY_POOL_SELECTORS.balanceOf}${accountWord}`, tag),
    callAt(rpc, token, `${STABILITY_POOL_SELECTORS.allowance}${accountWord}${encodeAddressWord(proxy)}`, tag),
    callAt(rpc, proxy, `${STABILITY_POOL_SELECTORS.getCompoundedMUSDDeposit}${accountWord}`, tag),
    callAt(rpc, proxy, `${STABILITY_POOL_SELECTORS.getDepositorCollateralGain}${accountWord}`, tag),
    callAt(rpc, proxy, STABILITY_POOL_SELECTORS.getTotalMUSDDeposits, tag),
    callAt(rpc, proxy, STABILITY_POOL_SELECTORS.getCollateralBalance, tag),
  ]);
  const poolMusd = decodeAddressWord(poolMusdHex, "Stability Pool MUSD token");
  if (!sameAddress(poolMusd, token)) return fail("The Stability Pool's live MUSD token does not match the verified Testnet MUSD contract. The route is disabled.");
  const decimals = decodeUint256(decimalsHex);
  if (decimals !== 18n) return fail("The configured Testnet MUSD token did not report 18 decimals. No amount is shown and no wallet request was made.");
  let symbol: string;
  try { symbol = decodeAbiString(symbolHex); } catch { return fail("The configured Testnet MUSD symbol could not be verified. No wallet request was made."); }
  if (symbol !== "MUSD") return fail(`The configured Testnet token reported symbol ${JSON.stringify(symbol)}, not MUSD. The route is disabled.`);

  return {
    chainId,
    blockNumber: Number(blockNumberBig),
    blockTag,
    blockTimestamp,
    wallet,
    implementation: slotImplementation,
    musdAddress: poolMusd,
    decimals: 18,
    symbol: "MUSD",
    musdBalance: decodeUint256(balanceHex),
    allowance: decodeUint256(allowanceHex),
    compoundedDeposit: decodeUint256(compoundedHex),
    collateralGain: decodeUint256(gainHex),
    totalMUSDDeposits: decodeUint256(totalHex),
    poolCollateral: decodeUint256(collateralHex),
  };
}

function encodeUint(value: bigint): string {
  if (value < 0n || value > UINT256_MAX) return fail("The amount is outside the contract's uint256 range. No wallet request was made.");
  return value.toString(16).padStart(64, "0");
}

function parsePositiveAmount(amount: string): bigint {
  const parsed = parseAmount(amount, 18);
  if (!parsed.ok || parsed.raw <= 0n || parsed.raw > UINT256_MAX) {
    return fail("Enter a positive MUSD amount with at most 18 decimal places. No wallet request was made.");
  }
  return parsed.raw;
}

/**
 * Performs all live checks for the next explicit action. When allowance is short
 * the prepared action is an exact approve; after that receipt, the user must
 * prepare a new review before a separate deposit action can be opened.
 */
export async function prepareStabilityPoolAction(options: {
  network: MezoNetworkConfig;
  account: string | null;
  walletChainId: number | null;
  amount: string;
  rpc: RpcClient;
  nowMs?: number;
}): Promise<PreparedStabilityPoolAction> {
  if (options.walletChainId !== TESTNET_STABILITY_POOL.chainId) return fail("The connected wallet is not on Mezo Testnet (chain 31611). No wallet request was made.");
  if (!isAddress(options.account)) return fail("Connect a valid wallet account before preparing a Stability Pool action. No wallet request was made.");
  const amountWei = parsePositiveAmount(options.amount);
  const snapshot = await readStabilityPoolSnapshot({ network: options.network, owner: options.account, rpc: options.rpc, nowMs: options.nowMs });
  if (amountWei > snapshot.musdBalance) return fail("The requested amount exceeds the wallet's verified MUSD balance. No wallet request was made.");
  const action: "approve" | "deposit" = snapshot.allowance < amountWei ? "approve" : "deposit";
  const account = options.account as `0x${string}`;
  const to = action === "approve" ? snapshot.musdAddress : TESTNET_STABILITY_POOL.proxy;
  const data = (action === "approve"
    ? `${STABILITY_POOL_SELECTORS.approve}${encodeAddressWord(TESTNET_STABILITY_POOL.proxy)}${encodeUint(amountWei)}`
    : `${STABILITY_POOL_SELECTORS.provideToSP}${encodeUint(amountWei)}`) as `0x${string}`;
  const unsigned = { from: account, to, data, value: "0x0" as const };
  let gasEstimate: bigint;
  let gasLimit: bigint;
  try {
    const estimateHex = await options.rpc.call<string>("eth_estimateGas", [unsigned, snapshot.blockTag]);
    gasEstimate = parseHex(estimateHex, "The exact Stability Pool gas estimate");
    if (gasEstimate <= 0n || gasEstimate > UINT256_MAX) return fail("The Stability Pool gas estimate is outside the valid range. No wallet request was made.");
    gasLimit = (gasEstimate * 120n + 99n) / 100n;
    if (gasLimit > UINT256_MAX) return fail("The buffered gas limit is outside the valid range. No wallet request was made.");
    const simulated = await options.rpc.call<unknown>("eth_call", [{ ...unsigned, gas: `0x${gasLimit.toString(16)}` }, snapshot.blockTag]);
    if (typeof simulated !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(simulated)) return fail("The exact Stability Pool call simulation returned invalid data. No wallet request was made.");
    if (action === "approve" && decodeUint256(simulated) !== 1n) return fail("The exact MUSD approval simulation did not return true. No wallet request was made.");
    if (action === "deposit" && simulated !== "0x") return fail("The Stability Pool deposit simulation returned unexpected data. No wallet request was made.");
  } catch (error) {
    if (error instanceof StabilityPoolError) throw error;
    return fail("The exact Stability Pool call reverted or its fresh gas estimate/simulation failed. No wallet request was made.");
  }
  const transaction: StabilityPoolTransaction = Object.freeze({ ...unsigned, data, gas: `0x${gasLimit.toString(16)}` });
  return {
    action,
    account,
    amount: options.amount.trim(),
    amountWei,
    snapshot,
    transaction,
    gasEstimate,
    gasLimit,
    reviewedAtMs: options.nowMs ?? Date.now(),
  };
}

/** Ignore block height/time alone; all user-, pool-, allowance-, and implementation-critical values must still match. */
export function sameStabilityPoolReview(a: PreparedStabilityPoolAction, b: PreparedStabilityPoolAction): boolean {
  const keys: (keyof StabilityPoolSnapshot)[] = [
    "chainId", "wallet", "implementation", "musdAddress", "decimals", "symbol",
    "musdBalance", "allowance", "compoundedDeposit", "collateralGain", "totalMUSDDeposits", "poolCollateral",
  ];
  return a.action === b.action
    && a.account.toLowerCase() === b.account.toLowerCase()
    && a.amountWei === b.amountWei
    && keys.every((key) => a.snapshot[key] === b.snapshot[key])
    && a.gasEstimate === b.gasEstimate
    && a.gasLimit === b.gasLimit
    && a.transaction.from.toLowerCase() === b.transaction.from.toLowerCase()
    && a.transaction.to.toLowerCase() === b.transaction.to.toLowerCase()
    && a.transaction.data.toLowerCase() === b.transaction.data.toLowerCase()
    && BigInt(a.transaction.value) === BigInt(b.transaction.value)
    && BigInt(a.transaction.gas) === BigInt(b.transaction.gas);
}

export type StabilityPoolReceiptResult =
  | { status: "pending" }
  | { status: "confirmed"; blockNumber: number }
  | { status: "reverted"; blockNumber: number };

export class StabilityPoolReceiptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StabilityPoolReceiptError";
  }
}

interface RpcReceipt {
  transactionHash?: unknown; from?: unknown; to?: unknown; status?: unknown; blockNumber?: unknown; logs?: unknown;
}
interface RpcTransaction {
  hash?: unknown; from?: unknown; to?: unknown; input?: unknown; data?: unknown; value?: unknown; gas?: unknown;
}

function receiptFail(message: string): never { throw new StabilityPoolReceiptError(message); }
function validHash(value: unknown): value is string { return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value); }
function addressTopic(address: string): string { return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`; }
function eventHas(logs: unknown, expected: PreparedStabilityPoolAction): boolean {
  if (!Array.isArray(logs)) return false;
  const isMatching = (log: unknown, address: string, topic: string, dataWords: number, requiredData?: bigint) => {
    if (!log || typeof log !== "object") return false;
    const entry = log as { address?: unknown; topics?: unknown; data?: unknown };
    if (!isAddress(entry.address) || !sameAddress(entry.address, address) || !Array.isArray(entry.topics)) return false;
    if (typeof entry.topics[0] !== "string" || entry.topics[0].toLowerCase() !== topic.toLowerCase()) return false;
    if (typeof entry.topics[1] !== "string" || entry.topics[1].toLowerCase() !== addressTopic(expected.account).toLowerCase()) return false;
    if (entry.data !== `0x${"0".repeat(dataWords * 64)}` && (typeof entry.data !== "string" || !new RegExp(`^0x[0-9a-fA-F]{${dataWords * 64}}$`).test(entry.data))) return false;
    return requiredData === undefined || BigInt(entry.data) >= requiredData;
  };
  if (expected.action === "approve") {
    return logs.some((log) => {
      if (!log || typeof log !== "object") return false;
      const entry = log as { address?: unknown; topics?: unknown; data?: unknown };
      return isAddress(entry.address) && sameAddress(entry.address, expected.snapshot.musdAddress)
        && Array.isArray(entry.topics) && entry.topics.length === 3
        && typeof entry.topics[0] === "string" && entry.topics[0].toLowerCase() === APPROVAL_TOPIC.toLowerCase()
        && typeof entry.topics[1] === "string" && entry.topics[1].toLowerCase() === addressTopic(expected.account).toLowerCase()
        && typeof entry.topics[2] === "string" && entry.topics[2].toLowerCase() === addressTopic(TESTNET_STABILITY_POOL.proxy).toLowerCase()
        && typeof entry.data === "string" && /^0x[0-9a-fA-F]{64}$/.test(entry.data) && BigInt(entry.data) === expected.amountWei;
    });
  }
  return logs.some((log) => isMatching(log, TESTNET_STABILITY_POOL.proxy, USER_DEPOSIT_CHANGED_TOPIC, 1, expected.amountWei))
    && logs.some((log) => isMatching(log, TESTNET_STABILITY_POOL.proxy, COLLATERAL_GAIN_WITHDRAWN_TOPIC, 2))
    && logs.some((log) => {
      if (!log || typeof log !== "object") return false;
      const entry = log as { address?: unknown; topics?: unknown; data?: unknown };
      return isAddress(entry.address) && sameAddress(entry.address, expected.snapshot.musdAddress)
        && Array.isArray(entry.topics) && entry.topics.length === 3
        && typeof entry.topics[0] === "string" && entry.topics[0].toLowerCase() === TRANSFER_TOPIC.toLowerCase()
        && typeof entry.topics[1] === "string" && entry.topics[1].toLowerCase() === addressTopic(expected.account).toLowerCase()
        && typeof entry.topics[2] === "string" && entry.topics[2].toLowerCase() === addressTopic(TESTNET_STABILITY_POOL.proxy).toLowerCase()
        && typeof entry.data === "string" && /^0x[0-9a-fA-F]{64}$/.test(entry.data) && BigInt(entry.data) === expected.amountWei;
    });
}

/** Verify the exact approved/deposit call and expected on-chain events; never submits. */
export async function readStabilityPoolReceipt(options: {
  rpc: RpcClient;
  hash: string;
  expected: PreparedStabilityPoolAction;
}): Promise<StabilityPoolReceiptResult> {
  const { rpc, hash, expected } = options;
  if (!validHash(hash)) return receiptFail("The wallet returned an invalid transaction hash; confirmation is unknown.");
  let receipt: RpcReceipt | null;
  try { receipt = await rpc.call<RpcReceipt | null>("eth_getTransactionReceipt", [hash]); }
  catch { return receiptFail("The transaction receipt could not be read; confirmation is unknown."); }
  if (receipt === null) return { status: "pending" };
  if (!receipt || typeof receipt !== "object" || !validHash(receipt.transactionHash) || receipt.transactionHash.toLowerCase() !== hash.toLowerCase()) {
    return receiptFail("The receipt hash is invalid or does not match the wallet transaction; confirmation is unknown.");
  }
  if (!isAddress(receipt.from) || !sameAddress(receipt.from, expected.transaction.from)
    || !isAddress(receipt.to) || !sameAddress(receipt.to, expected.transaction.to)) {
    return receiptFail("The receipt sender or target does not match the reviewed transaction; confirmation is unknown.");
  }
  let transaction: RpcTransaction | null;
  try { transaction = await rpc.call<RpcTransaction | null>("eth_getTransactionByHash", [hash]); }
  catch { return receiptFail("The mined transaction details could not be read; confirmation is unknown."); }
  if (!transaction || typeof transaction !== "object") return receiptFail("The mined transaction details are unavailable; confirmation is unknown.");
  const input = typeof transaction.input === "string" ? transaction.input : transaction.data;
  const txValue = parseHex(transaction.value, "The mined transaction value");
  const txGas = parseHex(transaction.gas, "The mined transaction gas limit");
  if (!validHash(transaction.hash) || transaction.hash.toLowerCase() !== hash.toLowerCase()
    || !isAddress(transaction.from) || !sameAddress(transaction.from, expected.transaction.from)
    || !isAddress(transaction.to) || !sameAddress(transaction.to, expected.transaction.to)
    || typeof input !== "string" || input.toLowerCase() !== expected.transaction.data.toLowerCase()
    || txValue !== 0n || txGas !== BigInt(expected.transaction.gas)) {
    return receiptFail("The mined transaction does not match the reviewed sender, target, calldata, value, or gas; confirmation is unknown.");
  }
  const status = parseHex(receipt.status, "The receipt status");
  const block = parseHex(receipt.blockNumber, "The receipt block number");
  if (block <= 0n || block > BigInt(Number.MAX_SAFE_INTEGER) || (status !== 0n && status !== 1n)) {
    return receiptFail("The receipt status or block number is invalid; confirmation is unknown.");
  }
  if (status === 1n && !eventHas(receipt.logs, expected)) {
    return receiptFail(expected.action === "approve"
      ? "The successful receipt does not contain the exact MUSD Approval event; confirmation is unknown."
      : "The successful receipt does not contain matching Stability Pool deposit, MUSD transfer, and collateral-gain events; confirmation is unknown.");
  }
  return status === 1n ? { status: "confirmed", blockNumber: Number(block) } : { status: "reverted", blockNumber: Number(block) };
}
