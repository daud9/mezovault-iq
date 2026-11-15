import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MEZO_NETWORKS } from "../config/chains";
import { TESTNET_CL_CONTRACTS } from "../config/clPositions";
import type { RpcClient } from "./rpc";
import { classifyClRange, formatClAmount, readClPositionSnapshot } from "./clPositions";

const OWNER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const POOL = "0x1111111111111111111111111111111111111111";
const GAUGE = "0x2222222222222222222222222222222222222222";
const TOKEN0 = "0x3333333333333333333333333333333333333333";
const TOKEN1 = "0x4444444444444444444444444444444444444444";
const BLOCK_TAG = "0x100";
const BLOCK_TIMESTAMP = 1_700_000_000;

function word(value: bigint | number): string {
  const v = BigInt(value);
  return v.toString(16).padStart(64, "0");
}

function addressWord(value: string): string {
  return value.slice(2).toLowerCase().padStart(64, "0");
}

function addressResult(value: string): string {
  return `0x${addressWord(value)}`;
}

function uintResult(value: bigint | number): string {
  return `0x${word(value)}`;
}

function encodedString(value: string): string {
  const bytes = Buffer.from(value, "utf8").toString("hex");
  const padded = bytes.padEnd(Math.ceil(bytes.length / 64) * 64, "0");
  return `0x${word(32)}${word(bytes.length / 2)}${padded}`;
}

function positionResult(tickLower: number, tickUpper: number): string {
  const parts = [
    word(0),
    addressWord("0x0000000000000000000000000000000000000000"),
    addressWord(TOKEN0),
    addressWord(TOKEN1),
    word(60),
    word(tickLower),
    word(tickUpper),
    word(1_000),
    word(0),
    word(0),
    word(7),
    word(8),
  ];
  return `0x${parts.join("")}`;
}

function encodeInt24(value: number): string {
  return value < 0 ? ((1n << 256n) + BigInt(value)).toString(16).padStart(64, "f") : word(value);
}

function slot0Result(tick: number): string {
  return `0x${[
    word(1n << 96n),
    encodeInt24(tick),
    word(0),
    word(1),
    word(1),
    word(1),
  ].join("")}`;
}

function createRpc(options: { wrongOwner?: boolean; failCollect?: boolean } = {}) {
  const methods: string[] = [];
  const calls: { to: string; data: string; from?: string; blockTag: string }[] = [];
  const rpc: RpcClient = {
    async call<T>(method: string, params: unknown[] = []): Promise<T> {
      methods.push(method);
      if (method === "eth_chainId") return "0x7b7b" as T;
      if (method === "eth_blockNumber") return BLOCK_TAG as T;
      if (method === "eth_getBlockByNumber") return { timestamp: `0x${BLOCK_TIMESTAMP.toString(16)}` } as T;
      if (method === "eth_getCode") return "0x60016000" as T;
      if (method !== "eth_call") throw new Error(`Unexpected RPC method ${method}`);

      const [txValue, blockTagValue] = params as [{ to: string; data: string; from?: string }, string];
      const { to, data, from } = txValue;
      const selector = data.slice(0, 10).toLowerCase();
      const args = data.slice(10).toLowerCase();
      calls.push({ to: to.toLowerCase(), data, from: from?.toLowerCase(), blockTag: blockTagValue });
      if (blockTagValue !== BLOCK_TAG) throw new Error("A read escaped the snapshot block.");

      const factory = TESTNET_CL_CONTRACTS.factory.toLowerCase();
      const manager = TESTNET_CL_CONTRACTS.positionManager.toLowerCase();
      const pool = POOL.toLowerCase();
      const gauge = GAUGE.toLowerCase();
      const token0 = TOKEN0.toLowerCase();
      const token1 = TOKEN1.toLowerCase();
      if (to.toLowerCase() === factory && selector === "0xefde4e64") return uintResult(1) as T;
      if (to.toLowerCase() === factory && selector === "0x41d1de97") return addressResult(POOL) as T;
      if (to.toLowerCase() === factory && selector === "0x28af8d0b") return addressResult(POOL) as T;
      if (to.toLowerCase() === pool && selector === "0xa6f19c84") return addressResult(GAUGE) as T;
      if (to.toLowerCase() === pool && selector === "0x3850c7bd") return slot0Result(110) as T;
      if (to.toLowerCase() === gauge && selector === "0xae775c32") return uintResult(1) as T;
      if (to.toLowerCase() === gauge && selector === "0x38463937") return uintResult(2) as T;
      if (to.toLowerCase() === manager && selector === "0x70a08231") return uintResult(1) as T;
      if (to.toLowerCase() === manager && selector === "0x2f745c59") return uintResult(1) as T;
      if (to.toLowerCase() === manager && selector === "0x6352211e") {
        const tokenId = BigInt(`0x${args.slice(0, 64)}`);
        return addressResult(options.wrongOwner ? TOKEN1 : tokenId === 1n ? OWNER : GAUGE) as T;
      }
      if (to.toLowerCase() === manager && selector === "0x99fbab88") {
        const tokenId = BigInt(`0x${args.slice(0, 64)}`);
        return positionResult(tokenId === 1n ? 100 : 120, tokenId === 1n ? 120 : 140) as T;
      }
      if (to.toLowerCase() === manager && selector === "0xfc6f7865") {
        if (options.failCollect) throw new Error("simulated collect is not available");
        return `0x${word(from?.toLowerCase() === gauge ? 30 : 10)}${word(from?.toLowerCase() === gauge ? 40 : 20)}` as T;
      }
      if (to.toLowerCase() === token0 && selector === "0x95d89b41") return encodedString("MUSD") as T;
      if (to.toLowerCase() === token1 && selector === "0x95d89b41") return encodedString("BTC") as T;
      if ((to.toLowerCase() === token0 || to.toLowerCase() === token1) && selector === "0x313ce567") return uintResult(18) as T;
      if (to.toLowerCase() === gauge && selector === "0xf7c618c1") return addressResult(TOKEN0) as T;
      if (to.toLowerCase() === gauge && selector === "0x7b0a47ee") return uintResult(1_000_000_000_000_000_000n) as T;
      if (to.toLowerCase() === gauge && selector === "0xebe2b12b") return uintResult(BLOCK_TIMESTAMP + 3_600) as T;
      if (to.toLowerCase() === gauge && selector === "0x3e491d47") return uintResult(5_000_000_000_000_000_000n) as T;
      throw new Error(`Unexpected eth_call ${to} ${selector} ${args}`);
    },
  };
  return { rpc, methods, calls };
}

function indexedAddress(index: number): string {
  return `0x${index.toString(16).padStart(40, "0")}`;
}

function createBudgetRpc(gaugeCount: number, positionsPerGauge: number, directlyOwnedCount = 0, duplicateGaugeTokenIds = false) {
  const calls: { to: string; data: string; blockTag: string }[] = [];
  const pools = Array.from({ length: gaugeCount }, (_, index) => ({
    address: indexedAddress(0x1000 + index),
    gauge: indexedAddress(0x2000 + index),
  }));
  const rpc: RpcClient = {
    async call<T>(method: string, params: unknown[] = []): Promise<T> {
      if (method === "eth_chainId") return "0x7b7b" as T;
      if (method === "eth_blockNumber") return BLOCK_TAG as T;
      if (method === "eth_getBlockByNumber") return { timestamp: `0x${BLOCK_TIMESTAMP.toString(16)}` } as T;
      if (method === "eth_getCode") return "0x60016000" as T;
      if (method !== "eth_call") throw new Error(`Unexpected RPC method ${method}`);

      const [txValue, blockTag] = params as [{ to: string; data: string }, string];
      const { to, data } = txValue;
      const normalizedTo = to.toLowerCase();
      const selector = data.slice(0, 10).toLowerCase();
      const args = data.slice(10);
      calls.push({ to: normalizedTo, data, blockTag });
      if (blockTag !== BLOCK_TAG) throw new Error("A read escaped the snapshot block.");

      const factory = TESTNET_CL_CONTRACTS.factory.toLowerCase();
      const manager = TESTNET_CL_CONTRACTS.positionManager.toLowerCase();
      if (normalizedTo === factory && selector === "0xefde4e64") return uintResult(gaugeCount) as T;
      if (normalizedTo === factory && selector === "0x41d1de97") {
        const index = Number(BigInt(`0x${args.slice(0, 64)}`));
        return addressResult(pools[index].address) as T;
      }
      const poolIndex = pools.findIndex((pool) => pool.address.toLowerCase() === normalizedTo);
      if (poolIndex >= 0 && selector === "0xa6f19c84") return addressResult(pools[poolIndex].gauge) as T;
      if (pools.some((pool) => pool.gauge.toLowerCase() === normalizedTo) && selector === "0xae775c32") {
        return uintResult(positionsPerGauge) as T;
      }
      if (normalizedTo === manager && selector === "0x70a08231") return uintResult(directlyOwnedCount) as T;
      if (selector === "0x38463937") {
        const gaugeIndex = pools.findIndex((pool) => pool.gauge.toLowerCase() === normalizedTo);
        const index = Number(BigInt(`0x${args.slice(64, 128)}`));
        return uintResult(duplicateGaugeTokenIds ? index + 1 : gaugeIndex * positionsPerGauge + index + 1) as T;
      }
      if (normalizedTo === manager && selector === "0x2f745c59") {
        const index = Number(BigInt(`0x${args.slice(64, 128)}`));
        return uintResult(gaugeCount * positionsPerGauge + index + 1) as T;
      }
      throw new Error(`Unexpected eth_call ${to} ${selector}`);
    },
  };
  return { rpc, calls };
}

describe("Mezo Testnet CL position reader", () => {
  it("classifies the live tick with an inclusive lower and exclusive upper bound", () => {
    assert.equal(classifyClRange(100, 100, 120), "in-range");
    assert.equal(classifyClRange(119, 100, 120), "in-range");
    assert.equal(classifyClRange(99, 100, 120), "below-range");
    assert.equal(classifyClRange(120, 100, 120), "above-range");
  });

  it("formats token amounts without floating-point rounding and avoids assumed decimals", () => {
    assert.equal(formatClAmount("1234567890123456789", 18), "1.234567");
    assert.equal(formatClAmount("42", null), "42 raw units");
  });

  it("rejects aggregate gauge counts above the cap before enumerating any staked IDs", async () => {
    const { rpc, calls } = createBudgetRpc(3, 334);
    await assert.rejects(
      readClPositionSnapshot({ network: MEZO_NETWORKS.testnet, owner: OWNER, rpc }),
      /more CL positions than this read-only view will enumerate/,
    );
    assert.equal(calls.filter((call) => call.data.startsWith("0xae775c32")).length, 3);
    assert.equal(calls.filter((call) => call.data.startsWith("0x38463937")).length, 0);
    assert.equal(calls.filter((call) => call.data.startsWith("0x2f745c59")).length, 0);
    assert.ok(calls.every((call) => call.blockTag === BLOCK_TAG));
  });

  it("includes wallet-held positions in the global budget before either enumeration path", async () => {
    const { rpc, calls } = createBudgetRpc(4, 250, 1);
    await assert.rejects(
      readClPositionSnapshot({ network: MEZO_NETWORKS.testnet, owner: OWNER, rpc }),
      /more CL positions than this read-only view will enumerate/,
    );
    assert.equal(calls.filter((call) => call.data.startsWith("0xae775c32")).length, 4);
    assert.equal(calls.filter((call) => call.data.startsWith("0x70a08231")).length, 1);
    assert.equal(calls.filter((call) => call.data.startsWith("0x38463937")).length, 0);
    assert.equal(calls.filter((call) => call.data.startsWith("0x2f745c59")).length, 0);
  });

  it("does not suppress duplicate NFT ambiguity when raw counts fit within the cap", async () => {
    const { rpc, calls } = createBudgetRpc(2, 1, 0, true);
    await assert.rejects(
      readClPositionSnapshot({ network: MEZO_NETWORKS.testnet, owner: OWNER, rpc }),
      /appeared in more than one gauge/,
    );
    assert.equal(calls.filter((call) => call.data.startsWith("0x38463937")).length, 2);
  });

  it("finds both wallet-held and gauge-staked NFTs from one same-block read-only snapshot", async () => {
    const { rpc, methods, calls } = createRpc();
    const snapshot = await readClPositionSnapshot({ network: MEZO_NETWORKS.testnet, owner: OWNER, rpc });

    assert.equal(snapshot.chainId, 31_611);
    assert.equal(snapshot.blockNumber, 256);
    assert.equal(snapshot.poolCount, 1);
    assert.equal(snapshot.positions.length, 2);
    assert.deepEqual(snapshot.positions.map((position) => position.tokenId), ["1", "2"]);
    assert.equal(snapshot.positions[0].isStaked, false);
    assert.equal(snapshot.positions[0].rangeState, "in-range");
    assert.equal(snapshot.positions[0].feeRead.status, "simulated");
    assert.equal(snapshot.positions[0].feeRead.token0Amount, "10");
    assert.equal(snapshot.positions[0].rewardSchedule?.earned, null);
    assert.equal(snapshot.positions[1].isStaked, true);
    assert.equal(snapshot.positions[1].rangeState, "below-range");
    assert.equal(snapshot.positions[1].feeRead.status, "simulated");
    assert.equal(snapshot.positions[1].feeRead.token0Amount, "30");
    assert.equal(snapshot.positions[1].rewardSchedule?.active, true);
    assert.equal(snapshot.positions[1].rewardSchedule?.earned, "5000000000000000000");
    assert.ok(methods.every((method) => ["eth_chainId", "eth_blockNumber", "eth_getBlockByNumber", "eth_getCode", "eth_call"].includes(method)));
    assert.ok(calls.every((call) => call.blockTag === BLOCK_TAG));
    assert.ok(calls.some((call) => call.to === TESTNET_CL_CONTRACTS.factory.toLowerCase() && call.data.startsWith("0x28af8d0b")));
    assert.ok(calls.some((call) => call.to === TESTNET_CL_CONTRACTS.positionManager.toLowerCase() && call.data.startsWith("0xfc6f7865") && call.from === OWNER.toLowerCase()));
    assert.ok(calls.some((call) => call.to === TESTNET_CL_CONTRACTS.positionManager.toLowerCase() && call.data.startsWith("0xfc6f7865") && call.from === GAUGE.toLowerCase()));
    assert.ok(!methods.some((method) => method.toLowerCase().includes("sendtransaction") || method.toLowerCase().includes("sign")));
  });

  it("does not show fee simulations as successful when eth_call cannot simulate collect", async () => {
    const { rpc } = createRpc({ failCollect: true });
    const snapshot = await readClPositionSnapshot({ network: MEZO_NETWORKS.testnet, owner: OWNER, rpc });
    assert.equal(snapshot.positions[0].feeRead.status, "unavailable");
    assert.equal(snapshot.positions[0].feeRead.token0Amount, null);
    assert.equal(snapshot.positions[0].feeRead.storedToken0Owed, "7");
  });

  it("fails closed if the RPC chain differs from Mezo Testnet", async () => {
    const { rpc } = createRpc();
    const wrongChainRpc: RpcClient = {
      async call<T>(method: string, params?: unknown[]): Promise<T> {
        if (method === "eth_chainId") return "0x7b7c" as T;
        return rpc.call<T>(method, params);
      },
    };
    await assert.rejects(
      readClPositionSnapshot({ network: MEZO_NETWORKS.testnet, owner: OWNER, rpc: wrongChainRpc }),
      /RPC reports chain 31612/,
    );
  });
});
