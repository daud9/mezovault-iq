import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toEventSelector } from "viem";
import { MEZO_NETWORKS } from "../config/chains";
import { TESTNET_BASIC_POOL_ROUTER, TESTNET_BASIC_POOLS } from "../config/pools";
import { createRpcClient } from "./rpc";
import { encodeAddressWord } from "./abi";
import { fakeFetch, encodeStringResult, encodeUintResult } from "./testHelpers";
import { TRANSFER_TOPIC } from "./transferLogs";
import { formatMUSDTokenAmount, minimumReceived, parseMUSDAmount, prepareMUSDAction, readMUSDReceipt, type PreparedMUSDAction } from "./musdSwap";

const NETWORK = MEZO_NETWORKS.testnet;
const ACCOUNT = "0x1111111111111111111111111111111111111111" as const;
const MUSD = NETWORK.musd!.address;
const POOL = TESTNET_BASIC_POOLS.find((p) => p.id === "musd-btc")!.address;
const ROUTER = TESTNET_BASIC_POOL_ROUTER.address;
const FACTORY = TESTNET_BASIC_POOL_ROUTER.factory;
const BTC_TOKEN = "0x7b7c000000000000000000000000000000000000" as const;
const WAD = 10n ** 18n;
const AMOUNT_IN = 2n * WAD;
const QUOTED_OUT = 25_535_096_324_990n;
const NOW_MS = Date.parse("2026-11-13T08:00:00.000Z");
const BLOCK_TAG = "0x100";
const BLOCK_TIMESTAMP = Math.floor(NOW_MS / 1000) - 10;
const HASH = `0x${"a".repeat(64)}`;
const APPROVAL_TOPIC = toEventSelector("Approval(address,address,uint256)");
const S = {
  token0: "0x0dfe1681",
  token1: "0xd21220a7",
  reserves: "0x0902f1ac",
  factory: "0xc45a0155",
  defaultFactory: "0xd4b6846d",
  quote: "0x5509a1ac",
  swap: "0xcac88ea9",
  allowance: "0xdd62ed3e",
  approve: "0x095ea7b3",
  transfer: "0xa9059cbb",
};

interface MockOptions {
  allowance?: bigint;
  musdBalance?: bigint;
  nativeBalance?: bigint;
  quoteOut?: bigint;
  simulatedOut?: bigint;
  chainId?: string;
  outputSymbol?: string;
  wrongFactory?: string;
  failEstimate?: boolean;
  failSwapSimulation?: boolean;
  failApprovalSimulation?: boolean;
  outputTransferResult?: bigint;
}

function word(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}
function addr(address: string): string {
  return encodeAddressWord(address);
}
function addressResult(address: string): string {
  return `0x${addr(address)}`;
}
function uintArray(values: bigint[]): string {
  return `0x${word(32n)}${word(BigInt(values.length))}${values.map(word).join("")}`;
}
function reserves(reserve0 = 10_000_000n * WAD, reserve1 = 100n * WAD): string {
  return `0x${word(reserve0)}${word(reserve1)}${word(100n)}`;
}
function topic(address: string): string {
  return `0x${addr(address)}`;
}

function handler(options: MockOptions = {}) {
  return (method: string, params: unknown[]) => {
    if (method === "eth_chainId") return options.chainId ?? "0x7b7b";
    if (method === "eth_blockNumber") return BLOCK_TAG;
    if (method === "eth_getBlockByNumber") return { number: BLOCK_TAG, timestamp: `0x${BLOCK_TIMESTAMP.toString(16)}` };
    if (method === "eth_getCode") return "0x60006000";
    if (method === "eth_getBalance") return `0x${(options.nativeBalance ?? WAD).toString(16)}`;
    if (method === "eth_gasPrice") return "0x64";
    if (method === "eth_estimateGas") return options.failEstimate ? new Error("estimate reverted") : "0x186a0";
    if (method === "eth_sendTransaction") return new Error("mock RPC tests must never send transactions");
    if (method === "eth_call") {
      const tx = params[0] as { to: string; data: string; from?: string; gas?: string; gasPrice?: string };
      const to = tx.to.toLowerCase();
      const data = tx.data.toLowerCase();
      const block = params[1];
      assert.equal(block, BLOCK_TAG, "contract calls stay pinned to the reviewed block");
      if (to === POOL.toLowerCase()) {
        if (data === S.token0) return addressResult(MUSD);
        if (data === S.token1) return addressResult(BTC_TOKEN);
        if (data === S.factory) return addressResult(options.wrongFactory ?? FACTORY);
        if (data === S.reserves) return reserves();
      }
      if (to === ROUTER.toLowerCase()) {
        if (data === S.defaultFactory) return addressResult(FACTORY);
        if (data.startsWith(S.quote)) return uintArray([AMOUNT_IN, options.quoteOut ?? QUOTED_OUT]);
        if (data.startsWith(S.swap)) {
          assert.equal(tx.from?.toLowerCase(), ACCOUNT.toLowerCase());
          assert.ok(tx.gas);
          assert.ok(tx.gasPrice);
          if (options.failSwapSimulation) return new Error("swap simulation reverted");
          return uintArray([AMOUNT_IN, options.simulatedOut ?? options.quoteOut ?? QUOTED_OUT]);
        }
      }
      if (to === MUSD.toLowerCase()) {
        if (data.startsWith("0x95d89b41")) return encodeStringResult("MUSD");
        if (data.startsWith("0x313ce567")) return encodeUintResult(18n);
        if (data.startsWith("0x70a08231")) {
          const account = `0x${data.slice(-40)}`.toLowerCase();
          return encodeUintResult(account === ACCOUNT.toLowerCase() ? options.musdBalance ?? 10n * WAD : 0n);
        }
        if (data.startsWith(S.allowance)) return encodeUintResult(options.allowance ?? 0n);
        if (data.startsWith(S.approve)) {
          assert.equal(tx.from?.toLowerCase(), ACCOUNT.toLowerCase());
          assert.ok(tx.gas);
          if (options.failApprovalSimulation) return new Error("approval simulation reverted");
          return encodeUintResult(1n);
        }
      }
      if (to === BTC_TOKEN.toLowerCase()) {
        if (data.startsWith("0x95d89b41")) return encodeStringResult(options.outputSymbol ?? "BTC");
        if (data.startsWith("0x313ce567")) return encodeUintResult(18n);
        if (data.startsWith("0x70a08231")) return encodeUintResult(100n * WAD);
        if (data.startsWith(S.transfer)) return encodeUintResult(options.outputTransferResult ?? 1n);
      }
      return new Error(`unexpected eth_call ${to} ${data}`);
    }
    return new Error(`unexpected mock RPC method ${method}`);
  };
}

function client(options: MockOptions = {}) {
  const mock = fakeFetch(handler(options));
  return { rpc: createRpcClient({ url: NETWORK.rpcUrl, fetchImpl: mock.fetchImpl }), calls: mock.calls };
}

async function prepare(options: MockOptions = {}, amount = "2", slippageBps = 100) {
  const { rpc, calls } = client(options);
  const action = await prepareMUSDAction({ network: NETWORK, owner: ACCOUNT, amount, slippageBps, rpc, nowMs: NOW_MS });
  return { action, calls, rpc };
}

function transactionAndReceipt(prepared: PreparedMUSDAction, logs: unknown[], status = "0x1", gasPrice = prepared.transaction.gasPrice) {
  const mock = fakeFetch((method) => {
    if (method === "eth_chainId") return "0x7b7b";
    if (method === "eth_getTransactionByHash") return {
      hash: HASH,
      from: ACCOUNT,
      to: prepared.transaction.to,
      input: prepared.transaction.data,
      value: "0x0",
      gas: prepared.transaction.gas,
      gasPrice,
    };
    if (method === "eth_getTransactionReceipt") return {
      transactionHash: HASH,
      status,
      blockNumber: "0x200",
      logs,
    };
    return new Error(`unexpected receipt RPC method ${method}`);
  });
  return { rpc: createRpcClient({ url: NETWORK.rpcUrl, fetchImpl: mock.fetchImpl }), calls: mock.calls };
}

function transferLog(token: string, from: string, to: string, amount: bigint) {
  return { address: token, topics: [TRANSFER_TOPIC, topic(from), topic(to)], data: `0x${word(amount)}` };
}

describe("MUSD swap input and route calculations", () => {
  it("parses exact 18-decimal MUSD amounts and rejects unsafe input", () => {
    assert.equal(parseMUSDAmount("2.000000000000000001"), 2n * WAD + 1n);
    for (const value of ["0", "-1", "1e3", ".2", "1.0000000000000000001", ""]) {
      assert.throws(() => parseMUSDAmount(value));
    }
  });

  it("floors the minimum received amount without floating-point rounding", () => {
    assert.equal(minimumReceived(101n, 100), 99n);
    assert.equal(formatMUSDTokenAmount(1n), "0.000000000000000001");
  });
});

describe("MUSD swap exact preflight and simulation", () => {
  it("prepares a limited approval when allowance is short and simulates the exact request", async () => {
    const { action, calls } = await prepare();
    assert.equal(action.kind, "approve");
    assert.equal(action.transaction.to.toLowerCase(), MUSD.toLowerCase());
    assert.equal(action.transaction.data, `${S.approve}${addr(ROUTER)}${word(AMOUNT_IN)}`);
    assert.equal(action.transaction.value, "0x0");
    assert.equal(action.gasEstimate, 100_000n);
    assert.equal(action.gasLimit, 120_000n);
    const sim = calls.find((call) => call.method === "eth_call" && (call.params[0] as { data: string }).data.startsWith(S.approve));
    assert.ok(sim);
    assert.equal((sim.params[0] as { from: string }).from.toLowerCase(), ACCOUNT.toLowerCase());
    assert.equal((sim.params[0] as { gas: string }).gas, "0x1d4c0");
    assert.equal(sim.params[1], BLOCK_TAG);
    assert.equal(calls.some((call) => call.method === "eth_sendTransaction"), false);
  });

  it("quotes the exact volatile MUSD/BTC route and simulates the same output before swap review", async () => {
    const { action, calls } = await prepare({ allowance: 3n * WAD });
    assert.equal(action.kind, "swap");
    assert.equal(action.quote.quotedOutRaw, QUOTED_OUT);
    assert.equal(action.quote.minimumOutRaw, QUOTED_OUT * 9_900n / 10_000n);
    assert.equal(action.simulatedOutRaw, QUOTED_OUT);
    assert.equal(action.quote.blockTimestamp, BLOCK_TIMESTAMP);
    assert.equal(action.deadline, BLOCK_TIMESTAMP + 300);
    assert.equal(action.transaction.to.toLowerCase(), ROUTER.toLowerCase());
    assert.equal(action.transaction.data.slice(0, 10), S.swap);
    const quoteCall = calls.find((call) => call.method === "eth_call" && (call.params[0] as { data: string }).data.startsWith(S.quote));
    assert.ok(quoteCall);
    const quoteBody = (quoteCall.params[0] as { data: string }).data.slice(10);
    assert.equal(BigInt(`0x${quoteBody.slice(0, 64)}`), AMOUNT_IN);
    assert.equal(BigInt(`0x${quoteBody.slice(64, 128)}`), 64n);
    assert.equal(BigInt(`0x${quoteBody.slice(128, 192)}`), 1n);
    assert.equal(quoteBody.slice(192, 256), addr(MUSD));
    assert.equal(quoteBody.slice(256, 320), addr(BTC_TOKEN));
    assert.equal(BigInt(`0x${quoteBody.slice(320, 384)}`), 0n, "pool route is volatile, not stable");
    assert.equal(quoteBody.slice(384, 448), addr(FACTORY));
    const swapCall = calls.find((call) => call.method === "eth_call" && (call.params[0] as { data: string }).data.startsWith(S.swap));
    assert.ok(swapCall);
    assert.equal((swapCall.params[0] as { gas: string }).gas, "0x1d4c0");
    assert.equal(swapCall.params[1], BLOCK_TAG);
    assert.equal(calls.some((call) => call.method === "eth_sendTransaction"), false);
  });

  it("blocks a pool/factory/token mismatch, unavailable BTC transfer, or non-Testnet network", async () => {
    for (const options of [
      { wrongFactory: "0x2222222222222222222222222222222222222222" },
      { outputSymbol: "NOT-BTC" },
      { outputTransferResult: 0n },
    ]) {
      const { rpc, calls } = client(options);
      await assert.rejects(prepareMUSDAction({ network: NETWORK, owner: ACCOUNT, amount: "2", slippageBps: 100, rpc, nowMs: NOW_MS }));
      assert.equal(calls.some((call) => call.method === "eth_estimateGas"), false);
      assert.equal(calls.some((call) => call.method === "eth_sendTransaction"), false);
    }
    const { rpc } = client();
    await assert.rejects(prepareMUSDAction({ network: { ...NETWORK, key: "mainnet" }, owner: ACCOUNT, amount: "2", slippageBps: 100, rpc, nowMs: NOW_MS }), /only on Mezo Testnet/);
  });

  it("blocks insufficient wallet MUSD and insufficient native BTC gas", async () => {
    const notEnoughMUSD = client({ musdBalance: WAD });
    await assert.rejects(prepareMUSDAction({ network: NETWORK, owner: ACCOUNT, amount: "2", slippageBps: 100, rpc: notEnoughMUSD.rpc, nowMs: NOW_MS }), /not enough MUSD.*Stability Pool/);
    assert.equal(notEnoughMUSD.calls.some((call) => call.method === "eth_estimateGas"), false);

    const notEnoughGas = client({ allowance: 3n * WAD, nativeBalance: 1n });
    await assert.rejects(prepareMUSDAction({ network: NETWORK, owner: ACCOUNT, amount: "2", slippageBps: 100, rpc: notEnoughGas.rpc, nowMs: NOW_MS }), /native BTC/);
    assert.equal(notEnoughGas.calls.some((call) => call.method === "eth_sendTransaction"), false);
  });

  it("fails closed on estimation, approval simulation, swap simulation, or quote disagreement", async () => {
    for (const options of [
      { failEstimate: true },
      { failApprovalSimulation: true },
    ]) {
      const { rpc, calls } = client(options);
      await assert.rejects(prepareMUSDAction({ network: NETWORK, owner: ACCOUNT, amount: "2", slippageBps: 100, rpc, nowMs: NOW_MS }));
      assert.equal(calls.some((call) => call.method === "eth_sendTransaction"), false);
    }
    for (const options of [
      { allowance: 3n * WAD, failSwapSimulation: true },
      { allowance: 3n * WAD, simulatedOut: QUOTED_OUT - 1n },
    ]) {
      const { rpc, calls } = client(options);
      await assert.rejects(prepareMUSDAction({ network: NETWORK, owner: ACCOUNT, amount: "2", slippageBps: 100, rpc, nowMs: NOW_MS }));
      assert.equal(calls.some((call) => call.method === "eth_sendTransaction"), false);
    }
  });
});

describe("MUSD swap receipt verification", () => {
  it("confirms approval only with the exact owner, spender and amount event", async () => {
    const { action } = await prepare();
    assert.equal(action.kind, "approve");
    const logs = [{
      address: MUSD,
      topics: [APPROVAL_TOPIC, topic(ACCOUNT), topic(ROUTER)],
      data: `0x${word(AMOUNT_IN)}`,
    }];
    const { rpc, calls } = transactionAndReceipt(action, logs);
    assert.deepEqual(await readMUSDReceipt({ network: NETWORK, rpc, prepared: action, transactionHash: HASH }), {
      status: "confirmed", blockNumber: 512, actualOutRaw: null,
    });
    assert.equal(calls.some((call) => call.method === "eth_sendTransaction"), false);
  });

  it("confirms the exact MUSD input and minimum pool-BTC output from the reviewed swap", async () => {
    const { action } = await prepare({ allowance: 3n * WAD });
    assert.equal(action.kind, "swap");
    const logs = [
      transferLog(MUSD, ACCOUNT, POOL, AMOUNT_IN),
      transferLog(BTC_TOKEN, POOL, ACCOUNT, action.quote.minimumOutRaw + 1n),
    ];
    const { rpc } = transactionAndReceipt(action, logs);
    assert.deepEqual(await readMUSDReceipt({ network: NETWORK, rpc, prepared: action, transactionHash: HASH }), {
      status: "confirmed", blockNumber: 512, actualOutRaw: action.quote.minimumOutRaw + 1n,
    });
  });

  it("does not confirm receipts with mismatched transaction details or missing output", async () => {
    const { action } = await prepare({ allowance: 3n * WAD });
    assert.equal(action.kind, "swap");
    const noOutput = transactionAndReceipt(action, [transferLog(MUSD, ACCOUNT, POOL, AMOUNT_IN)]);
    assert.deepEqual(await readMUSDReceipt({ network: NETWORK, rpc: noOutput.rpc, prepared: action, transactionHash: HASH }), {
      status: "unverified", message: "The receipt does not show BTC-token output at or above the reviewed minimum.",
    });
    const validLogs = [
      transferLog(MUSD, ACCOUNT, POOL, AMOUNT_IN),
      transferLog(BTC_TOKEN, POOL, ACCOUNT, action.quote.minimumOutRaw + 1n),
    ];
    const changedGasPrice = transactionAndReceipt(action, validLogs, "0x1", "0x65");
    const changedGasOutcome = await readMUSDReceipt({ network: NETWORK, rpc: changedGasPrice.rpc, prepared: action, transactionHash: HASH });
    assert.deepEqual(changedGasOutcome, { status: "unverified", message: "The transaction does not match the exact wallet-reviewed request." });
    const wrongInput = fakeFetch((method) => method === "eth_chainId" ? "0x7b7b"
      : method === "eth_getTransactionByHash" ? { hash: HASH, from: ACCOUNT, to: action.transaction.to, input: "0x1234", value: "0x0" }
        : method === "eth_getTransactionReceipt" ? { transactionHash: HASH, status: "0x1", blockNumber: "0x200", logs: [] }
          : new Error(`unexpected ${method}`));
    const rpc = createRpcClient({ url: NETWORK.rpcUrl, fetchImpl: wrongInput.fetchImpl });
    const outcome = await readMUSDReceipt({ network: NETWORK, rpc, prepared: action, transactionHash: HASH });
    assert.equal(outcome.status, "unverified");
  });
});
