import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MEZO_NETWORKS } from "../config/chains";
import { TESTNET_CL_CONTRACTS } from "../config/clPositions";
import type { RpcClient } from "./rpc";
import {
  CL_GET_POOL_INT24_SELECTOR,
  CL_GET_SWAP_FEE_SELECTOR,
  ClDepositPreflightError,
  ERC20_APPROVE_SELECTOR,
  SLIPSTREAM_MINT_SELECTOR,
  capRawAmountsToToken1Budget,
  encodeClApproveCall,
  encodeClMintCall,
  formatClFeePips,
  formatRawTokenAmount,
  minimumAmount,
  token0RawValueInToken1Raw,
  parseTokenAmount,
  readClDepositReview,
  simulateClApproval,
  simulateClMint,
  type ClDepositReview,
} from "./clDeposit";
import type { ClPlannerPool } from "./clPlanner";

const FACTORY = TESTNET_CL_CONTRACTS.factory;
const MANAGER = TESTNET_CL_CONTRACTS.positionManager;
const POOL = "0x1111111111111111111111111111111111111111" as const;
const TOKEN0 = "0x2222222222222222222222222222222222222222" as const;
const TOKEN1 = "0x3333333333333333333333333333333333333333" as const;
const WALLET = "0x4444444444444444444444444444444444444444" as const;
const Q96 = 1n << 96n;
const BLOCK = "0x100";
const TIMESTAMP = 10_000;

function word(value: bigint | number): string {
  const n = BigInt(value);
  return n < 0n ? ((1n << 256n) + n).toString(16).padStart(64, "0") : n.toString(16).padStart(64, "0");
}
function uintResult(value: bigint | number): string { return `0x${word(value)}`; }
function addressResult(address: string): string { return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`; }
function slot0(tick: number, sqrtPriceX96 = Q96): string { return `0x${word(sqrtPriceX96)}${word(tick)}${word(0)}${word(1)}${word(1)}${word(1)}`; }
function createPool(input: { decimals0?: number; decimals1?: number; tick?: number; sqrtPriceX96?: bigint } = {}): ClPlannerPool {
  return {
    address: POOL,
    token0: { address: TOKEN0, symbol: "T0", decimals: input.decimals0 ?? 18 },
    token1: { address: TOKEN1, symbol: "T1", decimals: input.decimals1 ?? 18 },
    tickSpacing: 10,
    currentTick: input.tick ?? 0,
    sqrtPriceX96: (input.sqrtPriceX96 ?? Q96).toString(),
    activeLiquidity: "5000000",
  };
}

function createRpc(options: { wrongChain?: boolean; feePips?: number; allowance0?: bigint; allowance1?: bigint; mintReturn?: string; decimals0?: number; decimals1?: number; currentTick?: number; sqrtPriceX96?: bigint } = {}) {
  const methods: string[] = [];
  const calls: { to: string; data: string; blockTag: string }[] = [];
  const rpc: RpcClient = {
    async call<T>(method: string, params: unknown[] = []): Promise<T> {
      methods.push(method);
      if (method === "eth_chainId") return (options.wrongChain ? "0x7b7c" : "0x7b7b") as T;
      if (method === "eth_blockNumber") return BLOCK as T;
      if (method === "eth_getBlockByNumber") return { timestamp: `0x${TIMESTAMP.toString(16)}` } as T;
      if (method === "eth_getCode") return "0x60016000" as T;
      if (method === "eth_estimateGas") return "0x186a0" as T;
      if (method !== "eth_call") throw new Error(`Unexpected RPC method ${method}`);
      const [tx, blockTag] = params as [{ to: string; data: string; gas?: string }, string];
      const to = tx.to.toLowerCase();
      const data = tx.data.toLowerCase();
      const selector = data.slice(0, 10);
      calls.push({ to, data, blockTag });
      if (blockTag !== BLOCK) throw new Error(`Unexpected block tag ${blockTag}`);
      if (to === MANAGER.toLowerCase() && selector === "0xc45a0155") return addressResult(FACTORY) as T;
      if (to === MANAGER.toLowerCase() && selector === SLIPSTREAM_MINT_SELECTOR) {
        const mintWord = (index: number) => BigInt(`0x${data.slice(10 + index * 64, 10 + (index + 1) * 64)}`);
        return (options.mintReturn ?? `0x${word(22)}${word(500)}${word(mintWord(7))}${word(mintWord(8))}`) as T;
      }
      if (to === POOL.toLowerCase() && selector === "0x0dfe1681") return addressResult(TOKEN0) as T;
      if (to === POOL.toLowerCase() && selector === "0xd21220a7") return addressResult(TOKEN1) as T;
      if (to === POOL.toLowerCase() && selector === "0xd0c93a7c") return uintResult(10) as T;
      if (to === POOL.toLowerCase() && selector === "0x3850c7bd") return slot0(options.currentTick ?? 0, options.sqrtPriceX96 ?? Q96) as T;
      if (to === POOL.toLowerCase() && selector === "0x1a686502") return uintResult(5_000_000) as T;
      if (to === FACTORY.toLowerCase() && selector === CL_GET_POOL_INT24_SELECTOR) return addressResult(POOL) as T;
      if (to === FACTORY.toLowerCase() && selector === CL_GET_SWAP_FEE_SELECTOR) return uintResult(options.feePips ?? 3_000) as T;
      if (to === TOKEN0.toLowerCase() && selector === "0x313ce567") return uintResult(options.decimals0 ?? 18) as T;
      if (to === TOKEN1.toLowerCase() && selector === "0x313ce567") return uintResult(options.decimals1 ?? 18) as T;
      if ((to === TOKEN0.toLowerCase() || to === TOKEN1.toLowerCase()) && selector === "0x70a08231") return uintResult(10n ** 30n) as T;
      if (to === TOKEN0.toLowerCase() && selector === "0xdd62ed3e") return uintResult(options.allowance0 ?? 0n) as T;
      if (to === TOKEN1.toLowerCase() && selector === "0xdd62ed3e") return uintResult(options.allowance1 ?? 0n) as T;
      if ((to === TOKEN0.toLowerCase() || to === TOKEN1.toLowerCase()) && selector === ERC20_APPROVE_SELECTOR) return uintResult(1) as T;
      throw new Error(`Unexpected call ${to} ${selector}`);
    },
  };
  return { rpc, methods, calls };
}

async function makeReview(rpc: RpcClient, nowMs = 20_000, selectedPool = createPool(), budgetToken1 = "100.125"): Promise<ClDepositReview> {
  return readClDepositReview({
    network: MEZO_NETWORKS.testnet,
    rpc,
    account: WALLET,
    selectedPool,
    lowerPrice: "0.9",
    upperPrice: "1.1",
    budgetToken1,
    slippageBps: 50,
    nowMs,
  });
}

describe("Mezo Testnet Slipstream deposit transaction builder", () => {
  it("encodes the exact 12-word mint tuple, signed ticks, recipient and zero sqrtPriceX96", () => {
    const data = encodeClMintCall({
      token0: TOKEN0,
      token1: TOKEN1,
      tickSpacing: 10,
      tickLower: -10,
      tickUpper: 20,
      amount0Desired: 500n,
      amount1Desired: 1_000n,
      amount0Min: 495n,
      amount1Min: 990n,
      recipient: WALLET,
      deadline: 12_345,
    });
    const words = data.slice(10).match(/.{64}/g) ?? [];
    assert.equal(data.slice(0, 10), "0xb5007d1f");
    assert.equal(data.length, 10 + 12 * 64);
    assert.equal(words.length, 12);
    assert.equal(words[0].slice(-40), TOKEN0.slice(2));
    assert.equal(words[1].slice(-40), TOKEN1.slice(2));
    assert.equal(words[2], word(10));
    assert.equal(words[3], word(-10));
    assert.equal(words[4], word(20));
    assert.equal(words[5], word(500));
    assert.equal(words[6], word(1_000));
    assert.equal(words[7], word(495));
    assert.equal(words[8], word(990));
    assert.equal(words[9].slice(-40), WALLET.slice(2));
    assert.equal(words[10], word(12_345));
    assert.equal(words[11], word(0));
  });

  it("encodes exact manager approvals and parses/prints token units without Number rounding", () => {
    assert.equal(encodeClApproveCall(MANAGER, 123_456n), `${ERC20_APPROVE_SELECTOR}${MANAGER.slice(2).toLowerCase().padStart(64, "0")}${word(123_456n)}`);
    assert.equal(parseTokenAmount("12.003400", 6), 12_003_400n);
    assert.throws(() => parseTokenAmount("1.0000001", 6), /at most 6/);
    assert.equal(formatRawTokenAmount(12_003_400n, 6), "12.0034");
    assert.equal(formatRawTokenAmount(3_000_000_000_000_000n, 18), "0.003");
    assert.equal(minimumAmount(10_001n, 50), 9_950n);
    assert.equal(formatClFeePips(3_000), "0.3%");
  });

  it("values token0 raw units correctly across asymmetric 18/6 and 6/18 decimal pairs", () => {
    const sqrt18To6 = Q96 / 1_000_000n;
    const sqrt6To18 = Q96 * 1_000_000n;
    assert.equal(token0RawValueInToken1Raw(10n ** 18n, sqrt18To6), 10n ** 6n);
    assert.equal(token0RawValueInToken1Raw(10n ** 6n, sqrt6To18), 10n ** 18n);
    assert.equal(token0RawValueInToken1Raw(1n, Q96 / 2n), 1n, "a fractional raw token1 value rounds upward");
  });

  it("scales a raw token split proportionally and stays within an exact token1 budget", () => {
    const capped = capRawAmountsToToken1Budget(2n, 2n, 3n, Q96);
    assert.deepEqual(capped, { amount0Desired: 1n, amount1Desired: 1n });
    assert.ok(token0RawValueInToken1Raw(capped.amount0Desired, Q96) + capped.amount1Desired <= 3n);
  });

  it("reads a fresh pool key, dynamic fee, exact balances and allowance state at one block", async () => {
    const { rpc, calls, methods } = createRpc();
    const review = await makeReview(rpc);
    assert.equal(review.chainId, 31_611);
    assert.equal(review.blockNumber, 256);
    assert.equal(review.blockTimestamp, TIMESTAMP);
    assert.equal(review.pool.address, POOL);
    assert.equal(review.pool.currentTick, 0);
    assert.equal(review.feePips, 3_000);
    assert.equal(review.amount0Desired !== "0", true);
    assert.equal(review.amount1Desired !== "0", true);
    assert.equal(BigInt(review.amount0Min), minimumAmount(BigInt(review.amount0Desired), 50));
    assert.equal(BigInt(review.amount1Min), minimumAmount(BigInt(review.amount1Desired), 50));
    assert.equal(review.deadline, TIMESTAMP + 300);
    assert.equal(review.mintTransaction.to, MANAGER);
    assert.equal(review.mintTransaction.from, WALLET);
    assert.equal(review.mintTransaction.value, "0x0");
    assert.equal(review.mintTransaction.data.slice(0, 10), SLIPSTREAM_MINT_SELECTOR);
    const valuedRaw = BigInt(review.amount0Desired) + BigInt(review.amount1Desired);
    assert.ok(valuedRaw <= parseTokenAmount("100.125", 18));
    assert.ok(calls.every((call) => call.blockTag === BLOCK));
    assert.ok(methods.includes("eth_getCode"));
    assert.ok(!methods.includes("eth_sendTransaction"));
  });

  it("keeps full review amounts within the token1 budget for both asymmetric decimal orderings", async () => {
    const cases = [
      { decimals0: 18, decimals1: 6, sqrtPriceX96: Q96 / 1_000_000n, currentTick: -276_324 },
      { decimals0: 6, decimals1: 18, sqrtPriceX96: Q96 * 1_000_000n, currentTick: 276_324 },
    ];
    for (const values of cases) {
      const pool = createPool({ decimals0: values.decimals0, decimals1: values.decimals1, sqrtPriceX96: values.sqrtPriceX96, tick: values.currentTick });
      const { rpc } = createRpc(values);
      const review = await makeReview(rpc, 20_000, pool);
      const valueInToken1Raw = token0RawValueInToken1Raw(BigInt(review.amount0Desired), values.sqrtPriceX96) + BigInt(review.amount1Desired);
      assert.ok(BigInt(review.amount0Desired) > 0n);
      assert.ok(BigInt(review.amount1Desired) > 0n);
      assert.ok(valueInToken1Raw <= parseTokenAmount("100.125", values.decimals1));
    }
  });

  it("refuses wrong-chain reviews and insufficient balances before wallet requests", async () => {
    const wrongChain = createRpc({ wrongChain: true });
    await assert.rejects(makeReview(wrongChain.rpc), /reports chain 31612/);
    const lowBalances = createRpc();
    const originalCall = lowBalances.rpc.call.bind(lowBalances.rpc);
    lowBalances.rpc.call = async <T>(method: string, params: unknown[] = []): Promise<T> => {
      if (method === "eth_call") {
        const [tx] = params as [{ to: string; data: string }];
        if (tx.to.toLowerCase() === TOKEN0.toLowerCase() && tx.data.startsWith("0x70a08231")) return uintResult(1) as T;
      }
      return originalCall(method, params) as Promise<T>;
    };
    await assert.rejects(makeReview(lowBalances.rpc), /does not hold enough T0/);
  });

  it("simulates one exact approval request without sending it", async () => {
    const { rpc, methods, calls } = createRpc();
    const review = await makeReview(rpc);
    const prepared = await simulateClApproval({ network: MEZO_NETWORKS.testnet, rpc, review, tokenIndex: 0, nowMs: review.reviewedAtMs + 1 });
    assert.equal(prepared.kind, "approve");
    assert.equal(prepared.transaction.to, TOKEN0);
    assert.equal(prepared.transaction.data.slice(0, 10), ERC20_APPROVE_SELECTOR);
    assert.equal(prepared.approvalAmount, review.amount0Desired);
    assert.equal(prepared.transaction.gas, "0x1d4c0");
    assert.ok(calls.some((call) => call.to === TOKEN0.toLowerCase() && call.data.startsWith(ERC20_APPROVE_SELECTOR)));
    assert.ok(methods.includes("eth_estimateGas"));
    assert.ok(!methods.includes("eth_sendTransaction"));
  });

  it("simulates mint only after both exact allowances are sufficient and checks returned amounts", async () => {
    const { rpc, methods } = createRpc({ allowance0: 10n ** 30n, allowance1: 10n ** 30n });
    const review = await makeReview(rpc);
    const simulated = await simulateClMint({ network: MEZO_NETWORKS.testnet, rpc, review, nowMs: review.reviewedAtMs + 1 });
    assert.equal(simulated.kind, "mint");
    assert.equal(simulated.transaction.to, MANAGER);
    assert.equal(simulated.transaction.value, "0x0");
    assert.equal(simulated.simulatedLiquidity, "500");
    assert.equal(simulated.simulatedAmount0, review.amount0Min);
    assert.equal(simulated.simulatedAmount1, review.amount1Min);
    assert.ok(methods.includes("eth_estimateGas"));
    assert.ok(!methods.includes("eth_sendTransaction"));
  });

  it("fails closed if the pool fee changes or the review expires", async () => {
    const { rpc } = createRpc();
    const review = await makeReview(rpc);
    const changedFee = createRpc({ feePips: 3_001, allowance0: 10n ** 30n, allowance1: 10n ** 30n });
    await assert.rejects(simulateClMint({ network: MEZO_NETWORKS.testnet, rpc: changedFee.rpc, review, nowMs: review.reviewedAtMs + 1 }), /tick or swap fee changed/);
    await assert.rejects(simulateClMint({ network: MEZO_NETWORKS.testnet, rpc, review, nowMs: review.reviewedAtMs + 180_001 }), ClDepositPreflightError);
  });
});
