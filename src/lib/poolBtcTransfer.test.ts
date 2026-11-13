import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MEZO_NETWORKS } from "../config/chains";
import { TESTNET_POOL_BTC_TOKEN } from "../config/pools";
import { encodeStringResult, encodeUintResult, fakeFetch, type Handler } from "./testHelpers";
import { createRpcClient } from "./rpc";
import { preparePoolBtcTransfer } from "./poolBtcTransfer";
import { requestWalletTransaction, type Eip1193Provider } from "./wallet";
import { waitForReceipt } from "./transfer";

const NETWORK = MEZO_NETWORKS.testnet;
const ACCOUNT = "0x1111111111111111111111111111111111111111" as const;
const RECIPIENT = "0x2222222222222222222222222222222222222222" as const;
const TOKEN = TESTNET_POOL_BTC_TOKEN.address;
const HASH = `0x${"ab".repeat(32)}`;
const BLOCK = "0x100";
const WAD = 10n ** 18n;

interface MockOptions {
  chainId?: string;
  code?: string;
  symbol?: string;
  decimals?: bigint;
  balance?: bigint;
  nativeBalance?: bigint;
  simulationResult?: bigint;
  failEstimate?: boolean;
}

function handler(options: MockOptions = {}): Handler {
  return (method, params) => {
    if (method === "eth_chainId") return options.chainId ?? "0x7b7b";
    if (method === "eth_blockNumber") return BLOCK;
    if (method === "eth_getCode") {
      assert.deepEqual(params, [TOKEN, BLOCK]);
      return options.code ?? "0x60006000";
    }
    if (method === "eth_getBalance") {
      assert.deepEqual(params, [ACCOUNT, BLOCK]);
      return `0x${(options.nativeBalance ?? WAD).toString(16)}`;
    }
    if (method === "eth_gasPrice") return "0x64";
    if (method === "eth_estimateGas") {
      assert.equal(params[1], BLOCK);
      const tx = params[0] as { from: string; to: string; value: string; data: string };
      assert.equal(tx.from.toLowerCase(), ACCOUNT.toLowerCase());
      assert.equal(tx.to.toLowerCase(), TOKEN.toLowerCase());
      assert.equal(tx.value, "0x0");
      assert.match(tx.data, /^0xa9059cbb/);
      if (options.failEstimate) return new Error("transfer would revert");
      return "0x5208";
    }
    if (method === "eth_call") {
      const call = params[0] as { from?: string; to: string; data: string; gas?: string };
      assert.equal(params[1], BLOCK);
      assert.equal(call.to.toLowerCase(), TOKEN.toLowerCase());
      if (call.data.startsWith("0x95d89b41")) return encodeStringResult(options.symbol ?? "BTC");
      if (call.data.startsWith("0x313ce567")) return encodeUintResult(options.decimals ?? 18n);
      if (call.data.startsWith("0x70a08231")) {
        assert.equal(call.data.slice(-40), ACCOUNT.slice(2).toLowerCase());
        return encodeUintResult(options.balance ?? 5n * WAD);
      }
      if (call.data.startsWith("0xa9059cbb")) {
        assert.equal(call.from?.toLowerCase(), ACCOUNT.toLowerCase());
        assert.equal(call.gas, "0x6270");
        return encodeUintResult(options.simulationResult ?? 1n);
      }
    }
    return new Error(`unexpected RPC method ${method}`);
  };
}
function setup(options: MockOptions = {}, network = NETWORK) {
  const mock = fakeFetch(handler(options));
  const rpc = createRpcClient({ url: NETWORK.rpcUrl, fetchImpl: mock.fetchImpl });
  return {
    calls: mock.calls,
    rpc,
    prepared: preparePoolBtcTransfer({
      network,
      owner: ACCOUNT,
      recipient: RECIPIENT,
      amount: "1.000000000000000001",
      rpc,
      nowMs: 1_800_000_000_000,
    }),
  };
}

describe("Pool BTC (ERC-20) Testnet transfer preflight", () => {
  it("verifies the fixed token, current balances, exact amount and transfer at one pinned block", async () => {
    const run = setup();
    const prepared = await run.prepared;
    assert.equal(prepared.transaction.to, TOKEN);
    assert.equal(prepared.transaction.value, "0x0");
    assert.equal(prepared.transaction.data, `0xa9059cbb${"0".repeat(24)}${RECIPIENT.slice(2)}${(WAD + 1n).toString(16).padStart(64, "0")}`);
    assert.equal(prepared.transaction.gas, "0x6270");
    assert.equal(prepared.amountRaw, WAD + 1n);
    assert.equal(prepared.tokenBalanceRaw, 5n * WAD);
    assert.equal(prepared.nativeBtcRaw, WAD);
    assert.equal(prepared.gasEstimate, 21_000n);
    assert.equal(prepared.gasLimit, 25_200n);
    assert.equal(prepared.maximumFeeRaw, 2_520_000n);
    assert.equal(prepared.blockNumber, 256);
    assert.equal(run.calls.some((call) => call.method === "eth_sendTransaction"), false);
    assert.ok(run.calls.some((call) => call.method === "eth_getCode" && call.params[1] === BLOCK));
    assert.ok(run.calls.some((call) => call.method === "eth_estimateGas" && call.params[1] === BLOCK));
    assert.ok(run.calls.some((call) => call.method === "eth_call" && (call.params[0] as { data: string }).data.startsWith("0xa9059cbb")));
    assert.ok(run.calls.filter((call) => call.method === "eth_call").every((call) => call.params[1] === BLOCK));
  });

  it("rejects any non-Testnet network or RPC chain", async () => {
    await assert.rejects(setup({}, MEZO_NETWORKS.mainnet).prepared, /only on Mezo Testnet/);
    const wrongRpc = setup({ chainId: "0x7b7c" });
    await assert.rejects(wrongRpc.prepared, /does not report Mezo Testnet/);
    assert.equal(wrongRpc.calls.some((call) => call.method === "eth_getCode"), false);
    assert.equal(wrongRpc.calls.some((call) => call.method === "eth_sendTransaction"), false);
  });

  it("requires deployed bytecode, exact BTC symbol and 18 decimals", async () => {
    for (const [options, message] of [
      [{ code: "0x" }, /no bytecode/],
      [{ symbol: "MUSD" }, /does not report symbol BTC/],
      [{ decimals: 8n }, /does not report 18 decimals/],
    ] as const) {
      const run = setup(options);
      await assert.rejects(run.prepared, message);
      assert.equal(run.calls.some((call) => call.method === "eth_estimateGas"), false);
      assert.equal(run.calls.some((call) => call.method === "eth_sendTransaction"), false);
    }
  });

  it("blocks an insufficient token balance before estimating gas", async () => {
    const run = setup({ balance: WAD });
    await assert.rejects(run.prepared, /not enough Pool BTC/);
    assert.equal(run.calls.some((call) => call.method === "eth_estimateGas"), false);
  });

  it("blocks insufficient native BTC gas before wallet review", async () => {
    const run = setup({ nativeBalance: 1n });
    await assert.rejects(run.prepared, /native BTC \(gas BTC\)/);
    assert.equal(run.calls.some((call) => call.method === "eth_sendTransaction"), false);
  });

  it("requires the exact transfer simulation and successful gas estimate", async () => {
    const failedSimulation = setup({ simulationResult: 0n });
    await assert.rejects(failedSimulation.prepared, /simulation did not return true/);
    const failedEstimate = setup({ failEstimate: true });
    await assert.rejects(failedEstimate.prepared, /RPC endpoint could not be reached/);
    assert.equal(failedEstimate.calls.some((call) => call.method === "eth_sendTransaction"), false);
  });

  it("rejects invalid recipients and amounts without making an RPC request", async () => {
    const badRecipient = createRpcClient({ url: NETWORK.rpcUrl, fetchImpl: fakeFetch(handler()).fetchImpl });
    await assert.rejects(preparePoolBtcTransfer({ network: NETWORK, owner: ACCOUNT, recipient: ACCOUNT, amount: "1", rpc: badRecipient }), /own address/);
    await assert.rejects(preparePoolBtcTransfer({ network: NETWORK, owner: ACCOUNT, recipient: RECIPIENT, amount: "1.0000000000000000001", rpc: badRecipient }), /at most 18 decimal places/);
  });

  it("hands only the reviewed request to a mock wallet provider after checking account and chain", async () => {
    const run = setup();
    const prepared = await run.prepared;
    const providerCalls: { method: string; params?: unknown }[] = [];
    const provider: Eip1193Provider = {
      async request(args) {
        providerCalls.push(args);
        if (args.method === "eth_accounts") return [ACCOUNT];
        if (args.method === "eth_chainId") return "0x7b7b";
        if (args.method === "eth_sendTransaction") return HASH;
        throw new Error(`unexpected provider request ${args.method}`);
      },
    };
    const hash = await requestWalletTransaction(provider, prepared.transaction, { account: ACCOUNT, chainId: 31_611 }, 31_611);
    assert.equal(hash, HASH);
    assert.deepEqual(providerCalls.map((call) => call.method), ["eth_accounts", "eth_chainId", "eth_sendTransaction"]);
    assert.deepEqual(providerCalls.at(-1)?.params, [prepared.transaction]);
    assert.equal(run.calls.some((call) => call.method === "eth_sendTransaction"), false);
  });

  it("uses the existing receipt polling semantics without submitting anything through RPC", async () => {
    const mock = fakeFetch((method) => method === "eth_getTransactionReceipt"
      ? { status: "0x1", blockNumber: "0x101", gasUsed: "0x5208" }
      : new Error(`unexpected RPC method ${method}`));
    const rpc = createRpcClient({ url: NETWORK.rpcUrl, fetchImpl: mock.fetchImpl });
    const outcome = await waitForReceipt({ rpc, hash: HASH, sleep: async () => {} });
    assert.equal(outcome.status, "success");
    assert.deepEqual(mock.calls.map((call) => call.method), ["eth_getTransactionReceipt"]);
    assert.equal(mock.calls.some((call) => call.method === "eth_sendTransaction"), false);
  });
});
