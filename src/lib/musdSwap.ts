import { decodeAbiString, decodeUint256, encodeAddressWord, isAddress, SELECTORS } from "./abi";
import type { MezoNetworkConfig } from "../config/chains";
import { TESTNET_BASIC_POOL_ROUTER, TESTNET_BASIC_POOLS } from "../config/pools";
import { parseChainId } from "./network";
import { readSnapshotBlock } from "./readSnapshotBlock";
import type { RpcClient } from "./rpc";
import { formatTokenUnits } from "./tokenAmount";
import { TRANSFER_TOPIC } from "./transferLogs";
import { toEventSelector } from "viem";

const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
const DECIMALS_SELECTOR = SELECTORS.decimals;
const TOKEN0_SELECTOR = "0x0dfe1681";
const TOKEN1_SELECTOR = "0xd21220a7";
const RESERVES_SELECTOR = "0x0902f1ac";
const FACTORY_SELECTOR = "0xc45a0155";
const ROUTER_DEFAULT_FACTORY_SELECTOR = "0xd4b6846d";
const GET_AMOUNTS_OUT_SELECTOR = "0x5509a1ac";
const SWAP_EXACT_TOKENS_SELECTOR = "0xcac88ea9";
const ALLOWANCE_SELECTOR = "0xdd62ed3e";
const APPROVE_SELECTOR = "0x095ea7b3";
const TRANSFER_SELECTOR = "0xa9059cbb";
const APPROVAL_TOPIC = toEventSelector("Approval(address,address,uint256)").toLowerCase();
const MAX_SLIPPAGE_BPS = 500n;
const GAS_BUFFER_NUMERATOR = 120n;
const GAS_BUFFER_DENOMINATOR = 100n;
const BPS_DENOMINATOR = 10_000n;
const MAX_SWAP_DEADLINE_SECONDS = 300;

export const MUSD_SWAP_SLIPPAGE_OPTIONS = [50, 100, 200] as const;
export const MUSD_SWAP_MAX_REVIEW_AGE_MS = 30_000;

export interface MUSDQuote {
  amountInRaw: bigint;
  quotedOutRaw: bigint;
  minimumOutRaw: bigint;
  allowanceRaw: bigint;
  walletMusdRaw: bigint;
  nativeBtcRaw: bigint;
  reserveInRaw: bigint;
  reserveOutRaw: bigint;
  blockNumber: number;
  blockTimestamp: number;
  slippageBps: number;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  router: `0x${string}`;
  pool: `0x${string}`;
  factory: `0x${string}`;
  preparedAtMs: number;
}

export type PreparedMUSDAction =
  | {
      kind: "approve";
      quote: MUSDQuote;
      transaction: Record<string, string>;
      gasEstimate: bigint;
      gasLimit: bigint;
      gasPrice: bigint;
      maximumFeeRaw: bigint;
      preparedAtMs: number;
    }
  | {
      kind: "swap";
      quote: MUSDQuote;
      transaction: Record<string, string>;
      gasEstimate: bigint;
      gasLimit: bigint;
      gasPrice: bigint;
      maximumFeeRaw: bigint;
      simulatedOutRaw: bigint;
      deadline: number;
      preparedAtMs: number;
    };

export type MUSDReceiptOutcome =
  | { status: "pending" }
  | { status: "confirmed"; blockNumber: number; actualOutRaw: bigint | null }
  | { status: "reverted"; blockNumber: number }
  | { status: "unverified"; message: string };

export function parseMUSDAmount(text: string): bigint {
  const value = text.trim();
  if (!/^\d+(?:\.\d*)?$/.test(value)) throw new Error("Enter a positive MUSD amount using digits and an optional decimal point.");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > 18) throw new Error("MUSD supports up to 18 decimal places.");
  const raw = BigInt(whole) * 10n ** 18n + BigInt((fraction + "0".repeat(18)).slice(0, 18));
  if (raw <= 0n) throw new Error("Enter an amount greater than zero.");
  return raw;
}

export function minimumReceived(quotedOutRaw: bigint, slippageBps: number): bigint {
  if (quotedOutRaw <= 0n) throw new Error("The live quote is zero; no swap can be prepared.");
  if (!Number.isInteger(slippageBps) || slippageBps <= 0 || BigInt(slippageBps) > MAX_SLIPPAGE_BPS) {
    throw new Error("Choose a slippage tolerance from 0.01% to 5%.");
  }
  return (quotedOutRaw * (BPS_DENOMINATOR - BigInt(slippageBps))) / BPS_DENOMINATOR;
}

export async function prepareMUSDAction(options: {
  network: MezoNetworkConfig;
  owner: string;
  amount: string;
  slippageBps: number;
  rpc: RpcClient;
  nowMs?: number;
}): Promise<PreparedMUSDAction> {
  const { network, owner, amount, slippageBps, rpc } = options;
  const nowMs = options.nowMs ?? Date.now();
  if (network.key !== "testnet" || network.chainId !== 31_611 || !network.musd) {
    throw new Error("MUSD-to-BTC swap is available only on Mezo Testnet.");
  }
  if (!isAddress(owner)) throw new Error("Connect a valid wallet account before preparing a swap.");
  if (!Number.isSafeInteger(nowMs) || nowMs <= 0) throw new Error("The local clock is invalid; refresh and try again.");
  const amountInRaw = parseMUSDAmount(amount);
  const minimumOutRawForQuote = (quoted: bigint) => minimumReceived(quoted, slippageBps);

  const chainId = parseChainId(await rpc.call<string>("eth_chainId"));
  if (chainId !== network.chainId) throw new Error("The RPC reports a different network. No swap is prepared.");
  const { blockTag, blockNumber } = await readSnapshotBlock(rpc);
  const snapshotHeader = await rpc.call<null | { number?: unknown; timestamp?: unknown }>("eth_getBlockByNumber", [blockTag, false]);
  if (!snapshotHeader) throw new Error("The reviewed block header is unavailable.");
  const headerNumber = parseRpcQuantity(snapshotHeader.number, "snapshot block number");
  const headerTimestampRaw = parseRpcQuantity(snapshotHeader.timestamp, "snapshot block timestamp");
  if (headerNumber !== BigInt(blockNumber) || headerTimestampRaw <= 0n || headerTimestampRaw > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("The RPC returned a mismatched or invalid snapshot block header.");
  }
  const blockTimestamp = Number(headerTimestampRaw);
  const at = (to: string, data: string) => rpc.call<string>("eth_call", [{ to, data }, blockTag]);
  const musd = network.musd.address;
  const poolRef = TESTNET_BASIC_POOLS.find((pool) => pool.id === "musd-btc");
  if (!poolRef) throw new Error("The verified MUSD/BTC pool is not configured.");
  const pool = poolRef.address;
  const router = TESTNET_BASIC_POOL_ROUTER.address;
  const factory = TESTNET_BASIC_POOL_ROUTER.factory;

  await Promise.all([
    requireContract(rpc, musd, blockTag, "MUSD"),
    requireContract(rpc, pool, blockTag, "MUSD/BTC pool"),
    requireContract(rpc, router, blockTag, "swap router"),
  ]);

  const [token0, token1, poolFactory, routerFactory] = await Promise.all([
    at(pool, TOKEN0_SELECTOR).then(decodeAddress),
    at(pool, TOKEN1_SELECTOR).then(decodeAddress),
    at(pool, FACTORY_SELECTOR).then(decodeAddress),
    at(router, ROUTER_DEFAULT_FACTORY_SELECTOR).then(decodeAddress),
  ]);
  if (![token0.toLowerCase(), token1.toLowerCase()].includes(musd.toLowerCase())) {
    throw new Error("The configured pool does not contain the verified Testnet MUSD token.");
  }
  const tokenOut = token0.toLowerCase() === musd.toLowerCase() ? token1 : token0;
  if (tokenOut.toLowerCase() === musd.toLowerCase()) throw new Error("The pool returned a duplicate MUSD token address.");
  if (poolFactory.toLowerCase() !== factory.toLowerCase() || routerFactory.toLowerCase() !== factory.toLowerCase()) {
    throw new Error("The pool, router and verified Testnet factory do not agree. No swap is prepared.");
  }
  await requireContract(rpc, tokenOut, blockTag, "pool BTC token");

  const [musdSymbolHex, musdDecimalsHex, btcSymbolHex, btcDecimalsHex, reservesHex] = await Promise.all([
    at(musd, SELECTORS.symbol),
    at(musd, DECIMALS_SELECTOR),
    at(tokenOut, SELECTORS.symbol),
    at(tokenOut, DECIMALS_SELECTOR),
    at(pool, RESERVES_SELECTOR),
  ]);
  if (decodeAbiString(musdSymbolHex) !== "MUSD" || decodeUint256(musdDecimalsHex) !== 18n) {
    throw new Error("The MUSD token identity or decimals do not match the verified Testnet token.");
  }
  if (decodeAbiString(btcSymbolHex) !== "BTC" || decodeUint256(btcDecimalsHex) !== 18n) {
    throw new Error("The pool output is not a verified 18-decimal BTC token. No swap is prepared.");
  }
  if (!/^0x[0-9a-fA-F]{192,}$/.test(reservesHex)) throw new Error("The pool returned malformed reserves.");
  const reserveBody = reservesHex.slice(2);
  const reserve0 = BigInt(`0x${reserveBody.slice(0, 64)}`);
  const reserve1 = BigInt(`0x${reserveBody.slice(64, 128)}`);
  const reserveInRaw = token0.toLowerCase() === musd.toLowerCase() ? reserve0 : reserve1;
  const reserveOutRaw = token0.toLowerCase() === musd.toLowerCase() ? reserve1 : reserve0;
  if (reserveInRaw <= 0n || reserveOutRaw <= 0n) throw new Error("The MUSD/BTC pool has no active reserves.");

  const [walletMusdRaw, nativeBtcRaw, allowanceRaw, poolBtcRaw] = await Promise.all([
    at(musd, `${SELECTORS.balanceOf}${encodeAddressWord(owner)}`).then(decodeUint256),
    rpc.call<string>("eth_getBalance", [owner, blockTag]).then((value) => parseRpcQuantity(value, "native BTC balance")),
    at(musd, `${ALLOWANCE_SELECTOR}${encodeAddressWord(owner)}${encodeAddressWord(router)}`).then(decodeUint256),
    at(tokenOut, `${SELECTORS.balanceOf}${encodeAddressWord(pool)}`).then(decodeUint256),
  ]);
  if (walletMusdRaw < amountInRaw) throw new Error("There is not enough MUSD in this wallet. Stability Pool deposits are not available to swap here.");

  const route = encodeRoute(musd, tokenOut, factory);
  const quoteData = `${GET_AMOUNTS_OUT_SELECTOR}${uintWord(amountInRaw)}${uintWord(64n)}${uintWord(1n)}${route}`;
  const quoteAmounts = decodeUintArray(await at(router, quoteData));
  if (quoteAmounts.length !== 2 || quoteAmounts[0] !== amountInRaw || quoteAmounts[1] <= 0n) {
    throw new Error("The router did not return a valid one-pool MUSD/BTC quote.");
  }
  const quotedOutRaw = quoteAmounts[1];
  const minimumOutRaw = minimumOutRawForQuote(quotedOutRaw);
  if (poolBtcRaw < quotedOutRaw || minimumOutRaw <= 0n) {
    throw new Error("The pool BTC token balance does not support the quoted output.");
  }

  // Check the actual pool BTC token can transfer the quoted output to this wallet.
  const transferData = `${TRANSFER_SELECTOR}${encodeAddressWord(owner)}${uintWord(minimumOutRaw)}`;
  const transferSimulation = decodeUint256(await rpc.call<string>("eth_call", [{ from: pool, to: tokenOut, data: transferData }, blockTag]));
  if (transferSimulation !== 1n) throw new Error("The pool BTC token did not confirm a standard transferable BTC-token output.");

  const quote: MUSDQuote = {
    amountInRaw,
    quotedOutRaw,
    minimumOutRaw,
    allowanceRaw,
    walletMusdRaw,
    nativeBtcRaw,
    reserveInRaw,
    reserveOutRaw,
    blockNumber,
    blockTimestamp,
    slippageBps,
    tokenIn: musd,
    tokenOut,
    router,
    pool,
    factory,
    preparedAtMs: nowMs,
  };

  if (allowanceRaw < amountInRaw) {
    const approvalData = `${APPROVE_SELECTOR}${encodeAddressWord(router)}${uintWord(amountInRaw)}`;
    const approvalBase = { from: owner as `0x${string}`, to: musd, data: approvalData, value: "0x0" };
    const prepared = await estimateSimulateAndCheckGas({
      rpc,
      blockTag,
      baseTransaction: approvalBase,
      nativeBalanceRaw: nativeBtcRaw,
      simulate: (tx) => rpc.call<string>("eth_call", [{ ...tx }, blockTag]).then(decodeUint256),
    });
    const { simulationResult, ...approvalReview } = prepared;
    if (simulationResult !== 1n) throw new Error("The exact MUSD approval simulation did not return true.");
    return { kind: "approve", quote, ...approvalReview, preparedAtMs: nowMs };
  }

  const deadline = blockTimestamp + MAX_SWAP_DEADLINE_SECONDS;
  const swapData = encodeSwapExactTokens(amountInRaw, minimumOutRaw, route, owner, BigInt(deadline));
  const swapBase = { from: owner as `0x${string}`, to: router, data: swapData, value: "0x0" };
  const prepared = await estimateSimulateAndCheckGas({
    rpc,
    blockTag,
    baseTransaction: swapBase,
    nativeBalanceRaw: nativeBtcRaw,
    simulate: async (tx) => decodeUintArray(await rpc.call<string>("eth_call", [{ ...tx }, blockTag])),
  });
  const { simulationResult, ...swapReview } = prepared;
  if (!Array.isArray(simulationResult) || simulationResult.length !== 2 ||
      simulationResult[0] !== amountInRaw || simulationResult[1] !== quotedOutRaw ||
      simulationResult[1] < minimumOutRaw) {
    throw new Error("The exact swap simulation disagrees with the live quote. Refresh before trying again.");
  }
  return {
    kind: "swap",
    quote,
    ...swapReview,
    simulatedOutRaw: simulationResult[1],
    deadline,
    preparedAtMs: nowMs,
  };
}

async function estimateSimulateAndCheckGas<T>(options: {
  rpc: RpcClient;
  blockTag: string;
  baseTransaction: Record<string, string>;
  nativeBalanceRaw: bigint;
  simulate: (tx: Record<string, string>) => Promise<T>;
}): Promise<{ transaction: Record<string, string>; gasEstimate: bigint; gasLimit: bigint; gasPrice: bigint; maximumFeeRaw: bigint; simulationResult: T }> {
  const { rpc, blockTag, baseTransaction, nativeBalanceRaw } = options;
  const gasPrice = parseRpcQuantity(await rpc.call<string>("eth_gasPrice"), "gas price");
  if (gasPrice <= 0n) throw new Error("The current BTC gas price could not be verified.");
  const estimateTx = { ...baseTransaction, gasPrice: quantity(gasPrice) };
  const gasEstimate = parseRpcQuantity(await rpc.call<string>("eth_estimateGas", [estimateTx, blockTag]), "gas estimate");
  if (gasEstimate <= 0n) throw new Error("The network returned a zero gas estimate.");
  const gasLimit = (gasEstimate * GAS_BUFFER_NUMERATOR + GAS_BUFFER_DENOMINATOR - 1n) / GAS_BUFFER_DENOMINATOR;
  const maximumFeeRaw = gasLimit * gasPrice;
  if (maximumFeeRaw > nativeBalanceRaw) throw new Error("Not enough native BTC for the maximum reviewed gas fee.");
  const transaction = { ...estimateTx, gas: quantity(gasLimit) };
  const simulationResult = await options.simulate(transaction);
  return { transaction, gasEstimate, gasLimit, gasPrice, maximumFeeRaw, simulationResult };
}

export async function readMUSDReceipt(options: {
  network: MezoNetworkConfig;
  rpc: RpcClient;
  prepared: PreparedMUSDAction;
  transactionHash: string;
}): Promise<MUSDReceiptOutcome> {
  const { network, rpc, prepared, transactionHash } = options;
  if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) return { status: "unverified", message: "The wallet returned an invalid transaction hash." };
  const chainId = parseChainId(await rpc.call<string>("eth_chainId"));
  if (chainId !== network.chainId) return { status: "unverified", message: "The RPC reports another network; this transaction is not shown as confirmed." };

  const [tx, receipt] = await Promise.all([
    rpc.call<null | Record<string, unknown>>("eth_getTransactionByHash", [transactionHash]),
    rpc.call<null | Record<string, unknown>>("eth_getTransactionReceipt", [transactionHash]),
  ]);
  if (!tx || !receipt) return { status: "pending" };
  if (typeof tx.hash !== "string" || tx.hash.toLowerCase() !== transactionHash.toLowerCase() ||
      typeof tx.from !== "string" || tx.from.toLowerCase() !== String(prepared.transaction.from).toLowerCase() ||
      typeof tx.to !== "string" || tx.to.toLowerCase() !== String(prepared.transaction.to).toLowerCase() ||
      typeof tx.input !== "string" || tx.input.toLowerCase() !== String(prepared.transaction.data).toLowerCase() ||
      !matchesRpcQuantity(tx.value, "0x0") ||
      !matchesRpcQuantity(tx.gas, String(prepared.transaction.gas)) ||
      !matchesRpcQuantity(tx.gasPrice, String(prepared.transaction.gasPrice)) ||
      typeof receipt.transactionHash !== "string" || receipt.transactionHash.toLowerCase() !== transactionHash.toLowerCase()) {
    return { status: "unverified", message: "The transaction does not match the exact wallet-reviewed request." };
  }
  const blockNumber = parseRpcQuantity(receipt.blockNumber, "receipt block number");
  if (blockNumber <= 0n || blockNumber > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { status: "unverified", message: "The receipt block number is invalid." };
  }
  if (receipt.status === "0x0") return { status: "reverted", blockNumber: Number(blockNumber) };
  if (receipt.status !== "0x1" || !Array.isArray(receipt.logs)) {
    return { status: "unverified", message: "The receipt status or event list could not be verified." };
  }
  const logs = receipt.logs.filter(isRpcLog);
  if (prepared.kind === "approve") {
    const expectedOwnerTopic = `0x${encodeAddressWord(String(prepared.transaction.from))}`.toLowerCase();
    const expectedSpenderTopic = `0x${encodeAddressWord(prepared.quote.router)}`.toLowerCase();
    const approved = logs.some((log) => log.address.toLowerCase() === prepared.quote.tokenIn.toLowerCase() &&
      log.topics[0]?.toLowerCase() === APPROVAL_TOPIC && log.topics[1]?.toLowerCase() === expectedOwnerTopic &&
      log.topics[2]?.toLowerCase() === expectedSpenderTopic && decodeEventUint(log.data) === prepared.quote.amountInRaw);
    return approved
      ? { status: "confirmed", blockNumber: Number(blockNumber), actualOutRaw: null }
      : { status: "unverified", message: "The successful receipt does not contain the exact MUSD approval event." };
  }

  let inputTransferred = 0n;
  let outputReceived = 0n;
  const owner = String(prepared.transaction.from).toLowerCase();
  const pool = prepared.quote.pool.toLowerCase();
  for (const log of logs) {
    if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC.toLowerCase()) continue;
    const from = topicAddress(log.topics[1]);
    const to = topicAddress(log.topics[2]);
    const amount = decodeEventUint(log.data);
    if (amount === null) continue;
    if (log.address.toLowerCase() === prepared.quote.tokenIn.toLowerCase() && from === owner && to === pool) inputTransferred += amount;
    if (log.address.toLowerCase() === prepared.quote.tokenOut.toLowerCase() && from === pool && to === owner) outputReceived += amount;
  }
  if (inputTransferred !== prepared.quote.amountInRaw) {
    return { status: "unverified", message: "The receipt does not show the exact MUSD input transfer to the reviewed pool." };
  }
  if (outputReceived < prepared.quote.minimumOutRaw) {
    return { status: "unverified", message: "The receipt does not show BTC-token output at or above the reviewed minimum." };
  }
  return { status: "confirmed", blockNumber: Number(blockNumber), actualOutRaw: outputReceived };
}

function encodeRoute(from: string, to: string, factory: string): string {
  return `${addressWord(from)}${addressWord(to)}${uintWord(0n)}${addressWord(factory)}`;
}

function encodeSwapExactTokens(amountIn: bigint, minOut: bigint, route: string, recipient: string, deadline: bigint): string {
  return `${SWAP_EXACT_TOKENS_SELECTOR}${uintWord(amountIn)}${uintWord(minOut)}${uintWord(160n)}${addressWord(recipient)}${uintWord(deadline)}${uintWord(1n)}${route}`;
}

function uintWord(value: bigint): string {
  if (value < 0n || value >= 1n << 256n) throw new Error("A transaction amount is outside uint256 range.");
  return value.toString(16).padStart(64, "0");
}

function addressWord(address: string): string {
  if (!isAddress(address)) throw new Error("A contract returned an invalid EVM address.");
  return address.slice(2).toLowerCase().padStart(64, "0");
}

function decodeAddress(value: string): `0x${string}` {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value) || !/^0{24}/i.test(value.slice(2))) {
    throw new Error("A contract returned a malformed address.");
  }
  const address = `0x${value.slice(-40)}`;
  if (!isAddress(address) || address.toLowerCase() === ADDRESS_ZERO) throw new Error("A contract returned a zero or invalid address.");
  return address;
}

function decodeUintArray(value: string): bigint[] {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value) || value.length < 130) {
    throw new Error("The router returned malformed quote or simulation data.");
  }
  const body = value.slice(2);
  const offset = Number(BigInt(`0x${body.slice(0, 64)}`));
  if (!Number.isSafeInteger(offset) || offset < 32 || offset % 32 !== 0) throw new Error("The router returned an invalid amounts offset.");
  const lengthPosition = offset * 2;
  if (body.length < lengthPosition + 64) throw new Error("The router returned a truncated amounts array.");
  const length = Number(BigInt(`0x${body.slice(lengthPosition, lengthPosition + 64)}`));
  if (!Number.isSafeInteger(length) || length < 1 || length > 8 || body.length < lengthPosition + (length + 1) * 64) {
    throw new Error("The router returned an invalid amounts array length.");
  }
  return Array.from({ length }, (_, i) => BigInt(`0x${body.slice(lengthPosition + (i + 1) * 64, lengthPosition + (i + 2) * 64)}`));
}

async function requireContract(rpc: RpcClient, address: string, blockTag: string, label: string): Promise<void> {
  const code = await rpc.call<string>("eth_getCode", [address, blockTag]);
  if (typeof code !== "string" || !/^0x(?:[0-9a-fA-F]{2})+$/.test(code)) throw new Error(`${label} has no valid contract code at the reviewed block.`);
}

function parseRpcQuantity(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) throw new Error(`The RPC returned an invalid ${label}.`);
  return BigInt(value);
}

function matchesRpcQuantity(value: unknown, expected: string): boolean {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value) || !/^0x[0-9a-fA-F]+$/.test(expected)) return false;
  return BigInt(value) === BigInt(expected);
}

function quantity(value: bigint): string {
  return `0x${value.toString(16)}`;
}

function topicAddress(topic: unknown): string | null {
  if (typeof topic !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(topic)) return null;
  return `0x${topic.slice(-40)}`.toLowerCase();
}

function decodeEventUint(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) return null;
  return BigInt(value);
}

function isRpcLog(value: unknown): value is { address: string; topics: string[]; data: string } {
  if (typeof value !== "object" || value === null) return false;
  const log = value as { address?: unknown; topics?: unknown; data?: unknown };
  return isAddress(log.address) && Array.isArray(log.topics) && log.topics.every((topic) => typeof topic === "string") && typeof log.data === "string";
}

export function formatMUSDTokenAmount(raw: bigint): string {
  return formatTokenUnits(raw, 18, 18);
}
