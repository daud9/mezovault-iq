import type { MezoNetworkConfig } from "../config/chains";
import { TESTNET_CL_CONTRACTS } from "../config/clPositions";
import { decodeAbiString, isAddress } from "./abi";
import type { RpcClient } from "./rpc";

const SELECTOR = {
  allPoolsLength: "0xefde4e64",
  allPools: "0x41d1de97",
  token0: "0x0dfe1681",
  token1: "0xd21220a7",
  tickSpacing: "0xd0c93a7c",
  slot0: "0x3850c7bd",
  liquidity: "0x1a686502",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
} as const;

const MAX_POOLS = 1_000n;
const READ_CONCURRENCY = 8;
const Q96 = 1n << 96n;
const MIN_TICK = -887_272;
const MAX_TICK = 887_272;

export interface ClPlannerToken {
  address: `0x${string}`;
  symbol: string;
  decimals: number | null;
}

export interface ClPlannerPool {
  address: `0x${string}`;
  token0: ClPlannerToken;
  token1: ClPlannerToken;
  tickSpacing: number;
  currentTick: number;
  sqrtPriceX96: string;
  activeLiquidity: string;
}

export interface ClPlannerSnapshot {
  chainId: number;
  blockNumber: number;
  blockTimestamp: number | null;
  fetchedAt: string;
  factoryPoolCount: number;
  excludedPoolCount: number;
  pools: ClPlannerPool[];
}

export interface ClSplitResult {
  lowerTick: number;
  upperTick: number;
  alignedLowerPrice: number;
  alignedUpperPrice: number;
  currentPrice: number;
  inRange: boolean;
  token0Amount: number;
  token1Amount: number;
  budgetToken1: number;
}

/**
 * Reads factory-enumerated Mezo Testnet Slipstream pools from one block. Pools with
 * zero current liquidity or unreadable token decimals are excluded; no pool list is
 * hardcoded and no wallet address or wallet write method is used.
 */
export async function readClPlannerSnapshot(input: {
  network: MezoNetworkConfig;
  rpc: RpcClient;
  now?: () => Date;
}): Promise<ClPlannerSnapshot> {
  const { network, rpc } = input;
  if (network.key !== "testnet" || network.chainId !== TESTNET_CL_CONTRACTS.chainId) {
    throw new Error("The CL planner reads only the official Mezo Testnet deployments (chain 31611).");
  }

  const actualChainId = parseHexInteger(await rpc.call<string>("eth_chainId"), "RPC chain ID");
  if (actualChainId !== TESTNET_CL_CONTRACTS.chainId) {
    throw new Error(`The RPC reports chain ${actualChainId}; Mezo Testnet chain ${TESTNET_CL_CONTRACTS.chainId} is required.`);
  }

  const blockHex = await rpc.call<string>("eth_blockNumber");
  const blockBig = parseHexBigInt(blockHex, "block number");
  const blockNumber = toSafeNumber(blockBig, "block number");
  const blockTag = `0x${blockBig.toString(16)}`;
  await requireContractCode(rpc, TESTNET_CL_CONTRACTS.factory, blockTag, "official CL Factory");

  const poolCountBig = await readUint(rpc, TESTNET_CL_CONTRACTS.factory, SELECTOR.allPoolsLength, [], blockTag);
  if (poolCountBig > MAX_POOLS) throw new Error("The CL Factory returned an unexpectedly large pool count; no partial list is shown.");
  const factoryPoolCount = Number(poolCountBig);
  const addresses = await mapLimit(
    Array.from({ length: factoryPoolCount }, (_, index) => index),
    READ_CONCURRENCY,
    async (index) => decodeAddress(
      await call(rpc, TESTNET_CL_CONTRACTS.factory, encodeCall(SELECTOR.allPools, [uintWord(BigInt(index))]), blockTag),
      `CL Factory pool ${index}`,
    ),
  );
  if (new Set(addresses.map((address) => address.toLowerCase())).size !== addresses.length) {
    throw new Error("The CL Factory returned a duplicate pool address; no partial list is shown.");
  }

  const results = await mapLimit(addresses, READ_CONCURRENCY, (address) => readPool(rpc, address, blockTag));
  const pools = results.flatMap((result) => result.pool ? [result.pool] : []);
  pools.sort((a, b) => {
    const pairA = `${a.token0.symbol}/${a.token1.symbol}/${a.address}`.toLowerCase();
    const pairB = `${b.token0.symbol}/${b.token1.symbol}/${b.address}`.toLowerCase();
    return pairA.localeCompare(pairB);
  });

  let blockTimestamp: number | null = null;
  try {
    const block = await rpc.call<{ timestamp?: unknown }>("eth_getBlockByNumber", [blockTag, false]);
    if (typeof block.timestamp === "string") blockTimestamp = toSafeNumber(parseHexBigInt(block.timestamp, "block timestamp"), "block timestamp");
  } catch {
    // A checked block number remains useful if the provider omits optional timestamp metadata.
  }

  return {
    chainId: actualChainId,
    blockNumber,
    blockTimestamp,
    fetchedAt: (input.now ?? (() => new Date()))().toISOString(),
    factoryPoolCount,
    excludedPoolCount: results.filter((result) => result.pool === null).length,
    pools,
  };
}

/** Converts an entered price range (token1 per token0) to outward-rounded pool ticks. */
export function alignClPriceRange(
  pool: Pick<ClPlannerPool, "tickSpacing" | "token0" | "token1">,
  lowerPrice: number,
  upperPrice: number,
): { lowerTick: number; upperTick: number; lowerPrice: number; upperPrice: number } {
  validatePoolMathInputs(pool);
  if (!Number.isFinite(lowerPrice) || !Number.isFinite(upperPrice) || lowerPrice <= 0 || upperPrice <= 0) {
    throw new Error("Enter positive, finite lower and upper prices.");
  }
  if (lowerPrice >= upperPrice) throw new Error("The lower price must be below the upper price.");

  const decimals0 = pool.token0.decimals as number;
  const decimals1 = pool.token1.decimals as number;
  const rawLowerTick = priceToRawTick(lowerPrice, decimals0, decimals1);
  const rawUpperTick = priceToRawTick(upperPrice, decimals0, decimals1);
  if (!Number.isFinite(rawLowerTick) || !Number.isFinite(rawUpperTick)) {
    throw new Error("Those prices are outside the supported CL tick range.");
  }

  const spacing = pool.tickSpacing;
  const minAlignedTick = Math.ceil(MIN_TICK / spacing) * spacing;
  const maxAlignedTick = Math.floor(MAX_TICK / spacing) * spacing;
  const roundedLower = Math.floor(rawLowerTick / spacing + 1e-9) * spacing;
  const roundedUpper = Math.ceil(rawUpperTick / spacing - 1e-9) * spacing;
  const lowerTick = roundedLower === 0 ? 0 : roundedLower;
  const upperTick = roundedUpper === 0 ? 0 : roundedUpper;
  if (lowerTick < minAlignedTick || upperTick > maxAlignedTick) {
    throw new Error("The aligned range exceeds the supported CL tick limits.");
  }
  if (lowerTick >= upperTick) {
    throw new Error("The chosen price range is narrower than this pool’s tick spacing.");
  }
  return {
    lowerTick,
    upperTick,
    lowerPrice: priceAtTick(lowerTick, decimals0, decimals1),
    upperPrice: priceAtTick(upperTick, decimals0, decimals1),
  };
}

/**
 * Estimates token composition for a total budget valued in token1 at the live pool
 * price. It uses standard concentrated-liquidity amount equations with floating-point
 * display math; it is a planning estimate, not a quote or executable token amount.
 */
export function calculateClTokenSplit(
  pool: ClPlannerPool,
  input: { lowerPrice: number; upperPrice: number; budgetToken1: number },
): ClSplitResult {
  validatePoolMathInputs(pool);
  if (!Number.isFinite(input.budgetToken1) || input.budgetToken1 <= 0) {
    throw new Error(`Enter a positive total budget in ${pool.token1.symbol}.`);
  }
  const range = alignClPriceRange(pool, input.lowerPrice, input.upperPrice);
  const currentPrice = clHumanPrice(pool);
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) throw new Error("The live pool price is unavailable or outside the supported numeric range.");

  const currentSqrt = Math.sqrt(currentPrice);
  const lowerSqrt = Math.sqrt(range.lowerPrice);
  const upperSqrt = Math.sqrt(range.upperPrice);
  let token0Amount: number;
  let token1Amount: number;

  if (currentSqrt <= lowerSqrt) {
    // Below range: the position is entirely token0. Budget is valued at the live price.
    token0Amount = input.budgetToken1 / currentPrice;
    token1Amount = 0;
  } else if (currentSqrt >= upperSqrt) {
    // Above range: the position is entirely token1.
    token0Amount = 0;
    token1Amount = input.budgetToken1;
  } else {
    // Both raw token-amount equations share a decimals/liquidity scale that cancels
    // when normalized to the entered token1-valued budget.
    const amount0PerLiquidity = (1 / currentSqrt) - (1 / upperSqrt);
    const amount1PerLiquidity = currentSqrt - lowerSqrt;
    const valuePerLiquidity = amount0PerLiquidity * currentPrice + amount1PerLiquidity;
    if (!Number.isFinite(valuePerLiquidity) || valuePerLiquidity <= 0) {
      throw new Error("This range cannot be calculated at the current pool price.");
    }
    const liquidityScale = input.budgetToken1 / valuePerLiquidity;
    token0Amount = amount0PerLiquidity * liquidityScale;
    token1Amount = amount1PerLiquidity * liquidityScale;
  }

  if (![token0Amount, token1Amount].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error("The token split exceeds the supported numeric range.");
  }

  return {
    lowerTick: range.lowerTick,
    upperTick: range.upperTick,
    alignedLowerPrice: range.lowerPrice,
    alignedUpperPrice: range.upperPrice,
    currentPrice,
    inRange: pool.currentTick >= range.lowerTick && pool.currentTick < range.upperTick,
    token0Amount,
    token1Amount,
    budgetToken1: input.budgetToken1,
  };
}

/** Human-readable spot price: token1 per token0, adjusted by on-chain token decimals. */
export function clHumanPrice(pool: Pick<ClPlannerPool, "sqrtPriceX96" | "token0" | "token1">): number {
  const sqrtPriceX96 = BigInt(pool.sqrtPriceX96);
  if (sqrtPriceX96 <= 0n) return Number.NaN;
  const sqrtRawRatio = Number(sqrtPriceX96) / Number(Q96);
  const decimalAdjustment = 10 ** ((pool.token0.decimals as number) - (pool.token1.decimals as number));
  return sqrtRawRatio * sqrtRawRatio * decimalAdjustment;
}

function priceToRawTick(price: number, decimals0: number, decimals1: number): number {
  const rawPrice = price * 10 ** (decimals1 - decimals0);
  return Math.log(rawPrice) / Math.log(1.0001);
}

function priceAtTick(tick: number, decimals0: number, decimals1: number): number {
  return 1.0001 ** tick * 10 ** (decimals0 - decimals1);
}

function validatePoolMathInputs(pool: Pick<ClPlannerPool, "tickSpacing" | "token0" | "token1">): void {
  if (!Number.isInteger(pool.tickSpacing) || pool.tickSpacing <= 0 || pool.tickSpacing > MAX_TICK) {
    throw new Error("The pool returned an invalid tick spacing.");
  }
  for (const [index, token] of [pool.token0, pool.token1].entries()) {
    if (!Number.isInteger(token.decimals) || token.decimals! < 0 || token.decimals! > 36) {
      throw new Error(`On-chain decimals are unavailable for token${index}; no split is calculated.`);
    }
  }
}

async function readPool(rpc: RpcClient, address: `0x${string}`, blockTag: string): Promise<{ pool: ClPlannerPool | null }> {
  await requireContractCode(rpc, address, blockTag, "factory-enumerated CL pool");
  const [token0Address, token1Address, spacingResult, slot0Result, liquidityResult] = await Promise.all([
    call(rpc, address, SELECTOR.token0, blockTag).then((result) => decodeAddress(result, "pool token0")),
    call(rpc, address, SELECTOR.token1, blockTag).then((result) => decodeAddress(result, "pool token1")),
    call(rpc, address, SELECTOR.tickSpacing, blockTag),
    call(rpc, address, SELECTOR.slot0, blockTag),
    call(rpc, address, SELECTOR.liquidity, blockTag),
  ]);
  if (token0Address.toLowerCase() === token1Address.toLowerCase()) throw new Error(`Pool ${address} returned a duplicate token pair.`);

  const words = decodeWords(slot0Result, 6, `slot0 for ${address}`);
  const sqrtPriceX96 = BigInt(`0x${words[0]}`);
  const currentTick = toSafeNumber(decodeInt24Word(words[1]), "current pool tick");
  const tickSpacing = toSafeNumber(decodeInt24Word(decodeWords(spacingResult, 1, "pool tick spacing")[0]), "pool tick spacing");
  if (sqrtPriceX96 <= 0n || sqrtPriceX96 >= (1n << 160n)) throw new Error(`Pool ${address} returned an invalid sqrt price.`);
  if (tickSpacing <= 0 || tickSpacing > MAX_TICK) throw new Error(`Pool ${address} returned an invalid tick spacing.`);
  const activeLiquidity = readUintWord(liquidityResult, "pool active liquidity");
  if (activeLiquidity === 0n) return { pool: null };

  const [token0, token1] = await Promise.all([
    readTokenInfo(rpc, token0Address, blockTag),
    readTokenInfo(rpc, token1Address, blockTag),
  ]);
  // A pool is not usable for human price/range calculations without both verified
  // decimal counts. Keep it excluded rather than assuming a conventional 18 decimals.
  if (token0.decimals === null || token1.decimals === null) return { pool: null };

  return {
    pool: {
      address,
      token0,
      token1,
      tickSpacing,
      currentTick,
      sqrtPriceX96: sqrtPriceX96.toString(),
      activeLiquidity: activeLiquidity.toString(),
    },
  };
}

async function readTokenInfo(rpc: RpcClient, address: `0x${string}`, blockTag: string): Promise<ClPlannerToken> {
  const fallbackSymbol = `${address.slice(0, 6)}…${address.slice(-4)}`;
  let symbol = fallbackSymbol;
  let decimals: number | null = null;
  try {
    await requireContractCode(rpc, address, blockTag, "pool token");
    try {
      symbol = decodeTokenSymbol(await call(rpc, address, SELECTOR.symbol, blockTag)) || fallbackSymbol;
    } catch {
      // The address remains visible if a token has no standard readable symbol.
    }
    try {
      const decodedDecimals = readUintWord(await call(rpc, address, SELECTOR.decimals, blockTag), "token decimals");
      if (decodedDecimals <= 36n) decimals = Number(decodedDecimals);
    } catch {
      // Do not assume decimals; the containing pool will be excluded from calculations.
    }
  } catch {
    // No contract code means its metadata cannot be treated as verified.
  }
  return { address, symbol, decimals };
}

function decodeTokenSymbol(data: string): string {
  try {
    return decodeAbiString(data);
  } catch {
    const word = decodeWords(data, 1, "token symbol")[0];
    const bytes = word.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [];
    const end = bytes.indexOf(0);
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(end === -1 ? bytes : bytes.slice(0, end)));
  }
}

async function requireContractCode(rpc: RpcClient, address: string, blockTag: string, label: string): Promise<void> {
  const code = await rpc.call<string>("eth_getCode", [address, blockTag]);
  if (typeof code !== "string" || !/^0x[0-9a-fA-F]*$/.test(code) || code.length <= 2 || /^0x0+$/i.test(code)) {
    throw new Error(`No contract bytecode was found for ${label} at ${address} on the checked block.`);
  }
}

async function readUint(rpc: RpcClient, to: string, selector: string, args: string[], blockTag: string): Promise<bigint> {
  return readUintWord(await call(rpc, to, encodeCall(selector, args), blockTag), selector);
}

async function call(rpc: RpcClient, to: string, data: string, blockTag: string): Promise<string> {
  return rpc.call<string>("eth_call", [{ to, data }, blockTag]);
}

function encodeCall(selector: string, words: string[]): string {
  return `${selector}${words.join("")}`;
}

function uintWord(value: bigint): string {
  if (value < 0n || value >= (1n << 256n)) throw new Error("Integer is outside the ABI uint256 range.");
  return value.toString(16).padStart(64, "0");
}

function decodeWords(data: string, count: number, label: string): string[] {
  if (typeof data !== "string" || !/^0x[0-9a-fA-F]*$/.test(data)) throw new Error(`${label} returned malformed hex data.`);
  const body = data.slice(2);
  if (body.length < count * 64) throw new Error(`${label} returned too little data.`);
  return Array.from({ length: count }, (_, index) => body.slice(index * 64, (index + 1) * 64));
}

function readUintWord(data: string, label: string): bigint {
  return BigInt(`0x${decodeWords(data, 1, label)[0]}`);
}

function decodeAddress(data: string, label: string): `0x${string}` {
  const word = decodeWords(data, 1, label)[0];
  const address = `0x${word.slice(-40)}`;
  if (!isAddress(address)) throw new Error(`${label} returned an invalid address.`);
  return address;
}

function decodeInt24Word(word: string): bigint {
  const value = BigInt(`0x${word}`);
  const signed = value >= (1n << 255n) ? value - (1n << 256n) : value;
  if (signed < -(1n << 23n) || signed >= (1n << 23n)) throw new Error("Returned tick is outside the int24 range.");
  return signed;
}

function parseHexBigInt(value: string, label: string): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) throw new Error(`The RPC returned an invalid ${label}.`);
  return BigInt(value);
}

function parseHexInteger(value: string, label: string): number {
  return toSafeNumber(parseHexBigInt(value, label), label);
}

function toSafeNumber(value: bigint, label: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error(`The ${label} is outside the safe integer range.`);
  return Number(value);
}

async function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      output[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return output;
}
