import type { MezoNetworkConfig } from "../config/chains";
import { TESTNET_CL_CONTRACTS } from "../config/clPositions";
import { decodeAbiString, isAddress } from "./abi";
import type { RpcClient } from "./rpc";

const SELECTOR = {
  balanceOf: "0x70a08231",
  tokenOfOwnerByIndex: "0x2f745c59",
  positions: "0x99fbab88",
  collect: "0xfc6f7865",
  ownerOf: "0x6352211e",
  allPoolsLength: "0xefde4e64",
  allPools: "0x41d1de97",
  getPoolInt24: "0x28af8d0b",
  gauge: "0xa6f19c84",
  slot0: "0x3850c7bd",
  stakedLength: "0xae775c32",
  stakedByIndex: "0x38463937",
  rewardToken: "0xf7c618c1",
  rewardRate: "0x7b0a47ee",
  periodFinish: "0xebe2b12b",
  earned: "0x3e491d47",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
} as const;

const MAX_POOLS = 1_000n;
const MAX_POSITIONS = 1_000n;
const READ_CONCURRENCY = 8;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const UINT128_MAX = (1n << 128n) - 1n;

export type ClRangeState = "in-range" | "below-range" | "above-range";

export interface ClTokenInfo {
  address: `0x${string}`;
  symbol: string;
  decimals: number | null;
}

export interface ClFeeRead {
  status: "simulated" | "unavailable";
  token0Amount: string | null;
  token1Amount: string | null;
  storedToken0Owed: string;
  storedToken1Owed: string;
}

export interface ClRewardSchedule {
  status: "available" | "unavailable";
  token: ClTokenInfo | null;
  rewardRate: string | null;
  periodFinish: number | null;
  active: boolean | null;
  earned: string | null;
}

export interface ClPositionView {
  tokenId: string;
  poolAddress: `0x${string}`;
  token0: ClTokenInfo;
  token1: ClTokenInfo;
  tickSpacing: number;
  tickLower: number;
  tickUpper: number;
  currentTick: number;
  rangeState: ClRangeState;
  liquidity: string;
  isStaked: boolean;
  gaugeAddress: `0x${string}` | null;
  feeRead: ClFeeRead;
  rewardSchedule: ClRewardSchedule | null;
}

export interface ClPositionSnapshot {
  chainId: number;
  blockNumber: number;
  blockTimestamp: number | null;
  fetchedAt: string;
  wallet: `0x${string}`;
  poolCount: number;
  positions: ClPositionView[];
}

interface PositionRecord {
  token0: `0x${string}`;
  token1: `0x${string}`;
  tickSpacing: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
}

interface GaugePool {
  poolAddress: `0x${string}`;
  gaugeAddress: `0x${string}` | null;
  tokenIds: string[];
}

interface PoolState {
  address: `0x${string}`;
  currentTick: number;
  gaugeAddress: `0x${string}` | null;
}

export async function readClPositionSnapshot(input: {
  network: MezoNetworkConfig;
  owner: string;
  rpc: RpcClient;
}): Promise<ClPositionSnapshot> {
  const { network, rpc } = input;
  const owner = normalizeAddress(input.owner, "connected wallet");
  if (network.key !== "testnet" || network.chainId !== TESTNET_CL_CONTRACTS.chainId) {
    throw new Error("Concentrated-liquidity positions are supported only on Mezo Testnet (chain 31611).");
  }

  const actualChainId = parseHexInteger(await rpc.call<string>("eth_chainId"), "RPC chain ID");
  if (actualChainId !== TESTNET_CL_CONTRACTS.chainId) {
    throw new Error(`The RPC reports chain ${actualChainId}; Mezo Testnet chain ${TESTNET_CL_CONTRACTS.chainId} is required.`);
  }
  const blockTag = await rpc.call<string>("eth_blockNumber");
  const blockNumberBig = parseHexBigInt(blockTag, "block number");
  const blockNumber = toSafeNumber(blockNumberBig, "block number");
  const blockTimestamp = await readBlockTimestamp(rpc, blockTag);

  await Promise.all([
    requireContractCode(rpc, TESTNET_CL_CONTRACTS.factory, blockTag, "CL Factory"),
    requireContractCode(rpc, TESTNET_CL_CONTRACTS.positionManager, blockTag, "Nonfungible Position Manager"),
    requireContractCode(rpc, TESTNET_CL_CONTRACTS.gaugeFactory, blockTag, "CL Gauge Factory"),
  ]);

  const poolCountBig = await readUint(rpc, TESTNET_CL_CONTRACTS.factory, SELECTOR.allPoolsLength, [], blockTag);
  if (poolCountBig > MAX_POOLS) throw new Error("The CL Factory returned an unexpectedly large pool count; no partial position list is shown.");
  const poolCount = Number(poolCountBig);
  const poolAddresses = await mapLimit(Array.from({ length: poolCount }, (_, index) => index), READ_CONCURRENCY, async (index) => {
    const result = await call(rpc, TESTNET_CL_CONTRACTS.factory, encodeCall(SELECTOR.allPools, [uintWord(BigInt(index))]), blockTag);
    const address = decodeAddress(result, "CL Factory pool address");
    if (isZeroAddress(address)) throw new Error(`The CL Factory returned an empty pool at index ${index}.`);
    return address;
  });

  // A staked NFT is held by its gauge and is no longer in the position manager's
  // ERC-721 owner enumeration. Scan each live pool gauge so wallet stakes are not omitted.
  const gaugePools = await mapLimit(poolAddresses, READ_CONCURRENCY, async (poolAddress): Promise<GaugePool> => {
    await requireContractCode(rpc, poolAddress, blockTag, "CL pool");
    const gaugeResult = await call(rpc, poolAddress, SELECTOR.gauge, blockTag);
    const gaugeAddress = decodeAddress(gaugeResult, "CL pool gauge");
    if (isZeroAddress(gaugeAddress)) return { poolAddress, gaugeAddress: null, tokenIds: [] };
    await requireContractCode(rpc, gaugeAddress, blockTag, "CL gauge");
    const count = await readUint(rpc, gaugeAddress, SELECTOR.stakedLength, [addressWord(owner)], blockTag);
    if (count > MAX_POSITIONS) throw new Error("A CL gauge returned an unexpectedly large position count.");
    const tokenIds = await mapLimit(Array.from({ length: Number(count) }, (_, index) => index), READ_CONCURRENCY, async (index) => {
      const encoded = await call(rpc, gaugeAddress, encodeCall(SELECTOR.stakedByIndex, [addressWord(owner), uintWord(BigInt(index))]), blockTag);
      return readUintWord(encoded, "staked position token ID").toString();
    });
    return { poolAddress, gaugeAddress, tokenIds };
  });

  const directlyOwnedCount = await readUint(rpc, TESTNET_CL_CONTRACTS.positionManager, SELECTOR.balanceOf, [addressWord(owner)], blockTag);
  if (directlyOwnedCount > MAX_POSITIONS) throw new Error("The position manager returned an unexpectedly large wallet position count.");
  const directlyOwnedIds = await mapLimit(Array.from({ length: Number(directlyOwnedCount) }, (_, index) => index), READ_CONCURRENCY, async (index) => {
    const encoded = await call(rpc, TESTNET_CL_CONTRACTS.positionManager, encodeCall(SELECTOR.tokenOfOwnerByIndex, [addressWord(owner), uintWord(BigInt(index))]), blockTag);
    return readUintWord(encoded, "wallet position token ID").toString();
  });

  const gaugeByPool = new Map(gaugePools.map((entry) => [entry.poolAddress.toLowerCase(), entry.gaugeAddress]));
  const stakedGaugeByToken = new Map<string, `0x${string}`>();
  for (const entry of gaugePools) {
    if (!entry.gaugeAddress) continue;
    for (const tokenId of entry.tokenIds) {
      if (stakedGaugeByToken.has(tokenId)) throw new Error(`Position NFT ${tokenId} appeared in more than one gauge.`);
      stakedGaugeByToken.set(tokenId, entry.gaugeAddress);
    }
  }
  const allTokenIds = new Set(directlyOwnedIds);
  for (const tokenId of stakedGaugeByToken.keys()) {
    if (allTokenIds.has(tokenId)) throw new Error(`Position NFT ${tokenId} appeared as both wallet-held and staked at the checked block.`);
    allTokenIds.add(tokenId);
  }
  if (BigInt(allTokenIds.size) > MAX_POSITIONS) throw new Error("The wallet has more CL positions than this read-only view will enumerate.");

  const tokenInfoCache = new Map<string, Promise<ClTokenInfo>>();
  const poolStateCache = new Map<string, Promise<PoolState>>();
  const rewardScheduleCache = new Map<string, Promise<ClRewardSchedule>>();
  const getTokenInfo = (address: `0x${string}`) => {
    const key = address.toLowerCase();
    const existing = tokenInfoCache.get(key);
    if (existing) return existing;
    const pending = readTokenInfo(rpc, address, blockTag);
    tokenInfoCache.set(key, pending);
    return pending;
  };
  const getPoolState = (position: PositionRecord) => {
    const key = `${position.token0.toLowerCase()}:${position.token1.toLowerCase()}:${position.tickSpacing}`;
    const existing = poolStateCache.get(key);
    if (existing) return existing;
    const pending = readPoolState(rpc, position, blockTag, gaugeByPool);
    poolStateCache.set(key, pending);
    return pending;
  };
  const getRewardSchedule = (gaugeAddress: `0x${string}`) => {
    const key = gaugeAddress.toLowerCase();
    const existing = rewardScheduleCache.get(key);
    if (existing) return existing;
    const pending = readRewardSchedule(rpc, gaugeAddress, owner, blockTag, blockTimestamp, getTokenInfo);
    rewardScheduleCache.set(key, pending);
    return pending;
  };

  const positions = await mapLimit([...allTokenIds], 4, async (tokenId): Promise<ClPositionView> => {
    const id = BigInt(tokenId);
    const words = decodeWords(
      await call(rpc, TESTNET_CL_CONTRACTS.positionManager, encodeCall(SELECTOR.positions, [uintWord(id)]), blockTag),
      12,
      `position ${tokenId}`,
    );
    const record: PositionRecord = {
      token0: addressFromWord(words[2]),
      token1: addressFromWord(words[3]),
      tickSpacing: toSafeNumber(decodeInt24Word(words[4]), "tick spacing"),
      tickLower: toSafeNumber(decodeInt24Word(words[5]), "lower tick"),
      tickUpper: toSafeNumber(decodeInt24Word(words[6]), "upper tick"),
      liquidity: BigInt(`0x${words[7]}`),
      tokensOwed0: BigInt(`0x${words[10]}`),
      tokensOwed1: BigInt(`0x${words[11]}`),
    };
    if (record.tickSpacing <= 0 || record.tickLower >= record.tickUpper) throw new Error(`Position NFT ${tokenId} returned an invalid tick range.`);
    if (record.token0.toLowerCase() === record.token1.toLowerCase()) throw new Error(`Position NFT ${tokenId} returned an invalid token pair.`);

    const stakedGauge = stakedGaugeByToken.get(tokenId) ?? null;
    const observedOwner = decodeAddress(
      await call(rpc, TESTNET_CL_CONTRACTS.positionManager, encodeCall(SELECTOR.ownerOf, [uintWord(id)]), blockTag),
      `owner of position ${tokenId}`,
    );
    const expectedOwner = stakedGauge ?? owner;
    if (observedOwner.toLowerCase() !== expectedOwner.toLowerCase()) {
      throw new Error(`Position NFT ${tokenId} ownership changed or disagrees with its wallet/gauge enumeration; refresh before relying on this snapshot.`);
    }

    const [pool, token0, token1] = await Promise.all([
      getPoolState(record),
      getTokenInfo(record.token0),
      getTokenInfo(record.token1),
    ]);
    const feeRead = await simulateCollect(rpc, owner, stakedGauge ?? owner, tokenId, record.tokensOwed0, record.tokensOwed1, blockTag);
    const rewardScheduleBase = pool.gaugeAddress ? await getRewardSchedule(pool.gaugeAddress) : null;
    const rewardSchedule = rewardScheduleBase
      ? {
          ...rewardScheduleBase,
          earned: stakedGauge && pool.gaugeAddress
            ? await readEarned(rpc, pool.gaugeAddress, owner, tokenId, blockTag)
            : null,
        }
      : null;

    return {
      tokenId,
      poolAddress: pool.address,
      token0,
      token1,
      tickSpacing: record.tickSpacing,
      tickLower: record.tickLower,
      tickUpper: record.tickUpper,
      currentTick: pool.currentTick,
      rangeState: classifyClRange(pool.currentTick, record.tickLower, record.tickUpper),
      liquidity: record.liquidity.toString(),
      isStaked: stakedGauge !== null,
      gaugeAddress: stakedGauge ?? pool.gaugeAddress,
      feeRead,
      rewardSchedule,
    };
  });

  positions.sort((a, b) => BigInt(a.tokenId) < BigInt(b.tokenId) ? -1 : BigInt(a.tokenId) > BigInt(b.tokenId) ? 1 : 0);
  return {
    chainId: actualChainId,
    blockNumber,
    blockTimestamp,
    fetchedAt: new Date().toISOString(),
    wallet: owner,
    poolCount,
    positions,
  };
}

export function classifyClRange(currentTick: number, tickLower: number, tickUpper: number): ClRangeState {
  if (currentTick < tickLower) return "below-range";
  if (currentTick >= tickUpper) return "above-range";
  return "in-range";
}

export function formatClAmount(rawAmount: string, decimals: number | null, maxFractionDigits = 6): string {
  if (decimals === null || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) return `${rawAmount} raw units`;
  const value = BigInt(rawAmount);
  const scale = 10n ** BigInt(decimals);
  const whole = (value / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (decimals === 0 || maxFractionDigits <= 0) return whole;
  const fraction = (value % scale).toString().padStart(decimals, "0").slice(0, maxFractionDigits).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

async function readPoolState(rpc: RpcClient, position: PositionRecord, blockTag: string, gaugeByPool: Map<string, `0x${string}` | null>): Promise<PoolState> {
  const data = encodeCall(SELECTOR.getPoolInt24, [
    addressWord(position.token0),
    addressWord(position.token1),
    uintWord(BigInt(position.tickSpacing)),
  ]);
  const poolAddress = decodeAddress(await call(rpc, TESTNET_CL_CONTRACTS.factory, data, blockTag), "CL Factory pool lookup");
  if (isZeroAddress(poolAddress)) throw new Error(`No CL pool was found for ${position.token0}/${position.token1} at tick spacing ${position.tickSpacing}.`);
  const gaugeAddress = gaugeByPool.get(poolAddress.toLowerCase()) ?? null;
  if (!gaugeByPool.has(poolAddress.toLowerCase())) throw new Error(`Pool ${poolAddress} was not present in the CL Factory's same-block pool enumeration.`);
  await requireContractCode(rpc, poolAddress, blockTag, "CL pool");
  const slot = decodeWords(await call(rpc, poolAddress, SELECTOR.slot0, blockTag), 6, `slot0 for pool ${poolAddress}`);
  return {
    address: poolAddress,
    currentTick: toSafeNumber(decodeInt24Word(slot[1]), "current pool tick"),
    gaugeAddress,
  };
}

async function simulateCollect(
  rpc: RpcClient,
  recipient: `0x${string}`,
  caller: `0x${string}`,
  tokenId: string,
  storedToken0Owed: bigint,
  storedToken1Owed: bigint,
  blockTag: string,
): Promise<ClFeeRead> {
  try {
    const data = encodeCall(SELECTOR.collect, [
      uintWord(BigInt(tokenId)),
      addressWord(recipient),
      uintWord(UINT128_MAX),
      uintWord(UINT128_MAX),
    ]);
    const result = await call(rpc, TESTNET_CL_CONTRACTS.positionManager, data, blockTag, caller);
    const words = decodeWords(result, 2, `simulated collect for position ${tokenId}`);
    return {
      status: "simulated",
      token0Amount: BigInt(`0x${words[0]}`).toString(),
      token1Amount: BigInt(`0x${words[1]}`).toString(),
      storedToken0Owed: storedToken0Owed.toString(),
      storedToken1Owed: storedToken1Owed.toString(),
    };
  } catch {
    return {
      status: "unavailable",
      token0Amount: null,
      token1Amount: null,
      storedToken0Owed: storedToken0Owed.toString(),
      storedToken1Owed: storedToken1Owed.toString(),
    };
  }
}

async function readRewardSchedule(
  rpc: RpcClient,
  gaugeAddress: `0x${string}`,
  _owner: `0x${string}`,
  blockTag: string,
  blockTimestamp: number | null,
  getTokenInfo: (address: `0x${string}`) => Promise<ClTokenInfo>,
): Promise<ClRewardSchedule> {
  try {
    const [rewardTokenResult, rate, finish] = await Promise.all([
      call(rpc, gaugeAddress, SELECTOR.rewardToken, blockTag),
      readUint(rpc, gaugeAddress, SELECTOR.rewardRate, [], blockTag),
      readUint(rpc, gaugeAddress, SELECTOR.periodFinish, [], blockTag),
    ]);
    const rewardTokenAddress = decodeAddress(rewardTokenResult, "CL gauge reward token");
    const token = isZeroAddress(rewardTokenAddress) ? null : await getTokenInfo(rewardTokenAddress);
    const periodFinish = toSafeNumber(finish, "reward period finish");
    return {
      status: "available",
      token,
      rewardRate: rate.toString(),
      periodFinish,
      active: blockTimestamp === null ? null : rate > 0n && finish > BigInt(blockTimestamp),
      earned: null,
    };
  } catch {
    return { status: "unavailable", token: null, rewardRate: null, periodFinish: null, active: null, earned: null };
  }
}

async function readEarned(rpc: RpcClient, gauge: `0x${string}`, owner: `0x${string}`, tokenId: string, blockTag: string): Promise<string | null> {
  try {
    const result = await call(rpc, gauge, encodeCall(SELECTOR.earned, [addressWord(owner), uintWord(BigInt(tokenId))]), blockTag, owner);
    return readUintWord(result, "gauge earned rewards").toString();
  } catch {
    return null;
  }
}

async function readTokenInfo(rpc: RpcClient, address: `0x${string}`, blockTag: string): Promise<ClTokenInfo> {
  let symbol = shortAddress(address);
  let decimals: number | null = null;
  try {
    await requireContractCode(rpc, address, blockTag, "position token");
    const [symbolResult, decimalsResult] = await Promise.all([
      call(rpc, address, SELECTOR.symbol, blockTag),
      call(rpc, address, SELECTOR.decimals, blockTag),
    ]);
    symbol = decodeTokenSymbol(symbolResult) || symbol;
    const decodedDecimals = readUintWord(decimalsResult, "token decimals");
    if (decodedDecimals <= 255n) decimals = Number(decodedDecimals);
  } catch {
    // Keep the token address and raw-unit values available; never assume decimals.
  }
  return { address, symbol, decimals };
}

function decodeTokenSymbol(result: string): string {
  try {
    return decodeAbiString(result);
  } catch {
    const words = decodeWords(result, 1, "token symbol");
    const bytes = words[0].match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [];
    const end = bytes.indexOf(0);
    const visible = end === -1 ? bytes : bytes.slice(0, end);
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(visible));
  }
}

async function readBlockTimestamp(rpc: RpcClient, blockTag: string): Promise<number | null> {
  try {
    const block = await rpc.call<{ timestamp?: unknown }>("eth_getBlockByNumber", [blockTag, false]);
    if (typeof block.timestamp !== "string") return null;
    return toSafeNumber(parseHexBigInt(block.timestamp, "block timestamp"), "block timestamp");
  } catch {
    return null;
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

async function call(rpc: RpcClient, to: string, data: string, blockTag: string, from?: string): Promise<string> {
  const transaction: Record<string, string> = { to, data };
  if (from) transaction.from = from;
  return rpc.call<string>("eth_call", [transaction, blockTag]);
}

function encodeCall(selector: string, words: string[]): string {
  return `${selector}${words.join("")}`;
}

function addressWord(address: string): string {
  return normalizeAddress(address, "ABI address").slice(2).toLowerCase().padStart(64, "0");
}

function uintWord(value: bigint): string {
  if (value < 0n || value >= (1n << 256n)) throw new Error("Integer is out of ABI uint256 range.");
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
  return addressFromWord(word);
}

function addressFromWord(word: string): `0x${string}` {
  return `0x${word.slice(-40)}` as `0x${string}`;
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

function normalizeAddress(value: string, label: string): `0x${string}` {
  if (!isAddress(value)) throw new Error(`Invalid ${label} address.`);
  return value as `0x${string}`;
}

function isZeroAddress(value: string): boolean {
  return value.toLowerCase() === ZERO_ADDRESS;
}

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
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
