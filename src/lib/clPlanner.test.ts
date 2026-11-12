import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MEZO_NETWORKS } from "../config/chains";
import { TESTNET_CL_CONTRACTS } from "../config/clPositions";
import type { RpcClient } from "./rpc";
import { alignClPriceRange, calculateClTokenSplit, clHumanPrice, readClPlannerSnapshot, type ClPlannerPool } from "./clPlanner";

const FACTORY_POOL = "0x1111111111111111111111111111111111111111";
const ZERO_LIQUIDITY_POOL = "0x2222222222222222222222222222222222222222";
const TOKEN0 = "0x3333333333333333333333333333333333333333";
const TOKEN1 = "0x4444444444444444444444444444444444444444";
const BLOCK_TAG = "0x200";
const Q96 = 1n << 96n;

function word(value: bigint | number): string {
  const n = BigInt(value);
  return n < 0n ? ((1n << 256n) + n).toString(16).padStart(64, "0") : n.toString(16).padStart(64, "0");
}

function addressWord(value: string): string { return value.slice(2).toLowerCase().padStart(64, "0"); }
function addressResult(value: string): string { return `0x${addressWord(value)}`; }
function uintResult(value: bigint | number): string { return `0x${word(value)}`; }
function encodedString(value: string): string {
  const bytes = Buffer.from(value, "utf8").toString("hex");
  return `0x${word(32)}${word(bytes.length / 2)}${bytes.padEnd(Math.ceil(bytes.length / 64) * 64, "0")}`;
}
function slot0(tick: number, sqrt = Q96): string { return `0x${word(sqrt)}${word(tick)}${word(0)}${word(1)}${word(1)}${word(1)}`; }

function createPool(overrides: Partial<ClPlannerPool> = {}): ClPlannerPool {
  return {
    address: FACTORY_POOL as `0x${string}`,
    token0: { address: TOKEN0 as `0x${string}`, symbol: "BTC", decimals: 18 },
    token1: { address: TOKEN1 as `0x${string}`, symbol: "MUSD", decimals: 18 },
    tickSpacing: 10,
    currentTick: 0,
    sqrtPriceX96: Q96.toString(),
    activeLiquidity: "1000000",
    ...overrides,
  };
}

function createRpc(options: { wrongChain?: boolean } = {}) {
  const calls: { to: string; data: string; blockTag: string }[] = [];
  const methods: string[] = [];
  const rpc: RpcClient = {
    async call<T>(method: string, params: unknown[] = []): Promise<T> {
      methods.push(method);
      if (method === "eth_chainId") return (options.wrongChain ? "0x7b7c" : "0x7b7b") as T;
      if (method === "eth_blockNumber") return BLOCK_TAG as T;
      if (method === "eth_getBlockByNumber") return { timestamp: "0x65a0bc00" } as T;
      if (method === "eth_getCode") return "0x60016000" as T;
      if (method !== "eth_call") throw new Error(`Unexpected RPC method ${method}`);
      const [tx, blockTag] = params as [{ to: string; data: string }, string];
      calls.push({ to: tx.to.toLowerCase(), data: tx.data, blockTag });
      const selector = tx.data.slice(0, 10).toLowerCase();
      const to = tx.to.toLowerCase();
      if (blockTag !== BLOCK_TAG) throw new Error("A call escaped the snapshot block.");
      if (to === TESTNET_CL_CONTRACTS.factory.toLowerCase() && selector === "0xefde4e64") return uintResult(2) as T;
      if (to === TESTNET_CL_CONTRACTS.factory.toLowerCase() && selector === "0x41d1de97") {
        const index = BigInt(`0x${tx.data.slice(10)}`);
        return addressResult(index === 0n ? FACTORY_POOL : ZERO_LIQUIDITY_POOL) as T;
      }
      const pool = to === FACTORY_POOL.toLowerCase() || to === ZERO_LIQUIDITY_POOL.toLowerCase();
      if (pool && selector === "0x0dfe1681") return addressResult(TOKEN0) as T;
      if (pool && selector === "0xd21220a7") return addressResult(TOKEN1) as T;
      if (pool && selector === "0xd0c93a7c") return uintResult(10) as T;
      if (pool && selector === "0x3850c7bd") return slot0(0) as T;
      if (pool && selector === "0x1a686502") return uintResult(to === FACTORY_POOL.toLowerCase() ? 1_000_000 : 0) as T;
      if (to === TOKEN0.toLowerCase() && selector === "0x95d89b41") return encodedString("BTC") as T;
      if (to === TOKEN1.toLowerCase() && selector === "0x95d89b41") return encodedString("MUSD") as T;
      if ((to === TOKEN0.toLowerCase() || to === TOKEN1.toLowerCase()) && selector === "0x313ce567") return uintResult(18) as T;
      throw new Error(`Unexpected call ${to} ${selector}`);
    },
  };
  return { rpc, calls, methods };
}

describe("Mezo Testnet CL planner math", () => {
  it("converts token1-per-token0 prices to outward-rounded, spacing-aligned ticks", () => {
    const pool = createPool();
    const range = alignClPriceRange(pool, 0.9, 1.1);
    assert.equal(Math.abs(range.lowerTick % pool.tickSpacing), 0);
    assert.equal(Math.abs(range.upperTick % pool.tickSpacing), 0);
    assert.ok(range.lowerPrice <= 0.9);
    assert.ok(range.upperPrice >= 1.1);
    assert.ok(range.lowerTick < range.upperTick);

    const negativeTicks = alignClPriceRange(pool, 1.0001 ** -61, 1.0001 ** -59);
    assert.equal(negativeTicks.lowerTick, -70);
    assert.equal(negativeTicks.upperTick, -50);
  });

  it("adjusts live price for token decimals", () => {
    const pool = createPool({ token0: { ...createPool().token0, decimals: 18 }, token1: { ...createPool().token1, decimals: 6 } });
    assert.equal(clHumanPrice(pool), 1e12);
  });

  it("splits an in-range token1-valued budget and the current tick is inside the aligned bounds", () => {
    const pool = createPool();
    const split = calculateClTokenSplit(pool, { lowerPrice: 0.9, upperPrice: 1.1, budgetToken1: 100 });
    assert.equal(split.inRange, true);
    assert.ok(split.token0Amount > 0);
    assert.ok(split.token1Amount > 0);
    assert.ok(Math.abs(split.token0Amount * split.currentPrice + split.token1Amount - 100) < 1e-9);
  });

  it("treats the lower tick as inclusive and the upper tick as exclusive", () => {
    const atLower = calculateClTokenSplit(createPool(), { lowerPrice: 1, upperPrice: 1.2, budgetToken1: 100 });
    assert.equal(atLower.lowerTick, 0);
    assert.equal(atLower.inRange, true);
    assert.equal(atLower.token1Amount, 0);

    const atUpper = calculateClTokenSplit(createPool(), { lowerPrice: 0.8, upperPrice: 1, budgetToken1: 100 });
    assert.equal(atUpper.upperTick, 0);
    assert.equal(atUpper.inRange, false);
    assert.equal(atUpper.token0Amount, 0);
  });

  it("uses a single token side outside the selected range", () => {
    const belowRange = calculateClTokenSplit(createPool(), { lowerPrice: 1.1, upperPrice: 1.2, budgetToken1: 100 });
    assert.equal(belowRange.inRange, false);
    assert.equal(belowRange.token1Amount, 0);
    assert.ok(Math.abs(belowRange.token0Amount - 100) < 1e-9);

    const abovePool = createPool({ currentTick: 10_000, sqrtPriceX96: (BigInt(Math.floor(Math.sqrt(1.0001 ** 10_000) * Number(Q96)))).toString() });
    const aboveRange = calculateClTokenSplit(abovePool, { lowerPrice: 1.1, upperPrice: 1.2, budgetToken1: 100 });
    assert.equal(aboveRange.inRange, false);
    assert.equal(aboveRange.token0Amount, 0);
    assert.equal(aboveRange.token1Amount, 100);
  });

  it("rejects invalid, too-narrow, and out-of-tick-range price inputs", () => {
    const pool = createPool();
    assert.throws(() => alignClPriceRange(pool, 0, 1), /positive/);
    assert.throws(() => alignClPriceRange(pool, 1, 1), /below/);
    const expanded = alignClPriceRange(pool, 1, 1.00001);
    assert.equal(expanded.lowerTick, 0);
    assert.equal(expanded.upperTick, pool.tickSpacing);
    assert.throws(() => alignClPriceRange(pool, 1e-100, 2e-100), /tick limits/);
    assert.throws(() => calculateClTokenSplit(pool, { lowerPrice: 0.9, upperPrice: 1.1, budgetToken1: 0 }), /positive/);
    assert.throws(() => calculateClTokenSplit(createPool({ token0: { ...pool.token0, decimals: null } }), { lowerPrice: 0.9, upperPrice: 1.1, budgetToken1: 10 }), /decimals/);
  });
});

describe("Mezo Testnet CL planner live reader", () => {
  it("discovers factory pools at one checked block and excludes zero-liquidity pools", async () => {
    const { rpc, calls, methods } = createRpc();
    const snapshot = await readClPlannerSnapshot({ network: MEZO_NETWORKS.testnet, rpc, now: () => new Date("2026-11-12T12:00:00.000Z") });
    assert.equal(snapshot.chainId, 31_611);
    assert.equal(snapshot.blockNumber, 512);
    assert.equal(snapshot.factoryPoolCount, 2);
    assert.equal(snapshot.excludedPoolCount, 1);
    assert.equal(snapshot.pools.length, 1);
    assert.equal(snapshot.pools[0].token0.symbol, "BTC");
    assert.equal(snapshot.pools[0].token1.decimals, 18);
    assert.ok(calls.every((call) => call.blockTag === BLOCK_TAG));
    assert.ok(calls.some((call) => call.to === TESTNET_CL_CONTRACTS.factory.toLowerCase() && call.data.startsWith("0x41d1de97")));
    assert.ok(methods.every((method) => ["eth_chainId", "eth_blockNumber", "eth_getBlockByNumber", "eth_getCode", "eth_call"].includes(method)));
  });

  it("fails closed when the RPC reports a different chain", async () => {
    const { rpc } = createRpc({ wrongChain: true });
    await assert.rejects(readClPlannerSnapshot({ network: MEZO_NETWORKS.testnet, rpc }), /RPC reports chain 31612/);
  });
});
