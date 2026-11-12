import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toEventSelector } from "viem";
import { MEZO_NETWORKS } from "../config/chains";
import { TESTNET_STABILITY_POOL as C } from "../config/stabilityPool";
import { createRpcClient } from "./rpc";
import { encodeUintResult, fakeFetch, OWNER, type Handler } from "./testHelpers";
import {
  prepareStabilityPoolAction,
  readStabilityPoolReceipt,
  readStabilityPoolSnapshot,
  sameStabilityPoolReview,
  StabilityPoolError,
  STABILITY_POOL_SELECTORS as S,
} from "./stabilityPool";

const NETWORK = MEZO_NETWORKS.testnet;
const ACCOUNT = OWNER as `0x${string}`;
const NOW_SECONDS = Math.floor(Date.parse("2026-11-13T00:00:00Z") / 1_000);
const NOW_MS = NOW_SECONDS * 1_000;
const BLOCK = "0x100";
const BLOCK_NUMBER = 256;
const WAD = 10n ** 18n;
const HASH = `0x${"a".repeat(64)}`;
const APPROVAL_TOPIC = toEventSelector("Approval(address,address,uint256)");
const TRANSFER_TOPIC = toEventSelector("Transfer(address,address,uint256)");
const USER_TOPIC = toEventSelector("UserDepositChanged(address,uint256)");
const GAIN_TOPIC = toEventSelector("CollateralGainWithdrawn(address,uint256,uint256)");

function word(value: bigint): string { return value.toString(16).padStart(64, "0"); }
function addressWord(address: string): string { return address.slice(2).toLowerCase().padStart(64, "0"); }
function stringResult(value: string): string {
  const bytes = Buffer.from(value, "utf8").toString("hex");
  return `0x${word(32n)}${word(BigInt(bytes.length / 2))}${bytes.padEnd(Math.ceil(bytes.length / 64) * 64, "0")}`;
}
function implementationSlot(address = C.implementation): string { return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`; }

interface Options {
  chainId?: string;
  implementation?: string;
  codeAddress?: string;
  poolToken?: string;
  balance?: bigint;
  allowance?: bigint;
  timestamp?: number;
  failEstimate?: boolean;
  failSimulation?: boolean;
  approveResult?: string;
  depositResult?: string;
}

function handler(options: Options = {}): Handler {
  const token = NETWORK.musd!.address.toLowerCase();
  const pool = C.proxy.toLowerCase();
  return (method, params) => {
    if (method === "eth_chainId") return options.chainId ?? "0x7b7b";
    if (method === "eth_blockNumber") return BLOCK;
    if (method === "eth_getBlockByNumber") {
      assert.equal(params[0], BLOCK);
      return { number: BLOCK, timestamp: `0x${(options.timestamp ?? NOW_SECONDS - 10).toString(16)}` };
    }
    if (method === "eth_getCode") {
      const address = String(params[0]).toLowerCase();
      assert.equal(params[1], BLOCK);
      return options.codeAddress?.toLowerCase() === address ? "0x" : "0x60006000";
    }
    if (method === "eth_getStorageAt") {
      assert.equal(String(params[0]).toLowerCase(), pool);
      assert.equal(params[1], C.eip1967ImplementationSlot);
      assert.equal(params[2], BLOCK);
      return implementationSlot(options.implementation ?? C.implementation);
    }
    if (method === "eth_estimateGas") {
      assert.equal(params[1], BLOCK);
      const tx = params[0] as { from: string; to: string; data: string; value: string };
      assert.equal(tx.from.toLowerCase(), ACCOUNT.toLowerCase());
      assert.equal(tx.value, "0x0");
      if (options.failEstimate) return new Error("gas estimation failed");
      if (tx.data.startsWith(S.approve)) {
        assert.equal(tx.to.toLowerCase(), token);
        assert.equal(tx.data, `${S.approve}${addressWord(C.proxy)}${word(2n * WAD)}`);
      } else {
        assert.equal(tx.to.toLowerCase(), pool);
        assert.equal(tx.data, `${S.provideToSP}${word(2n * WAD)}`);
      }
      return "0x186a0";
    }
    if (method === "eth_call") {
      const tx = params[0] as { to: string; data: string; from?: string; gas?: string };
      const to = tx.to.toLowerCase();
      const data = tx.data.toLowerCase();
      assert.equal(params[1], BLOCK);
      if (options.failSimulation && (data.startsWith(S.approve) || data.startsWith(S.provideToSP))) return new Error("reverted");
      if (data.startsWith(S.approve) || data.startsWith(S.provideToSP)) {
        assert.equal(tx.from?.toLowerCase(), ACCOUNT.toLowerCase());
        assert.ok(tx.gas);
        if (data.startsWith(S.approve)) return options.approveResult ?? encodeUintResult(1n);
        return options.depositResult ?? "0x";
      }
      if (to === pool) {
        if (data === S.musd) return `0x${addressWord(options.poolToken ?? NETWORK.musd!.address)}`;
        if (data.startsWith(S.getCompoundedMUSDDeposit)) return encodeUintResult(420n * WAD);
        if (data.startsWith(S.getDepositorCollateralGain)) return encodeUintResult(3n * WAD / 10n);
        if (data === S.getTotalMUSDDeposits) return encodeUintResult(1_000n * WAD);
        if (data === S.getCollateralBalance) return encodeUintResult(4n * WAD);
      }
      if (to === token) {
        if (data === S.decimals) return encodeUintResult(18n);
        if (data === S.symbol) return stringResult("MUSD");
        if (data.startsWith(S.balanceOf)) return encodeUintResult(options.balance ?? 5n * WAD);
        if (data.startsWith(S.allowance)) return encodeUintResult(options.allowance ?? 0n);
      }
      return new Error(`unexpected eth_call ${to} ${data}`);
    }
    if (method === "eth_sendTransaction") return new Error("tests must never submit transactions");
    return new Error(`unexpected RPC method ${method}`);
  };
}

function client(options: Options = {}) {
  const mock = fakeFetch(handler(options));
  return { rpc: createRpcClient({ url: NETWORK.rpcUrl, fetchImpl: mock.fetchImpl }), calls: mock.calls };
}

async function prepare(options: Options = {}, amount = "2") {
  const { rpc, calls } = client(options);
  const review = await prepareStabilityPoolAction({ network: NETWORK, account: ACCOUNT, walletChainId: 31611, amount, rpc, nowMs: NOW_MS });
  return { review, calls, rpc };
}

describe("Mezo Testnet Stability Pool read and guarded action preparation", () => {
  it("reads the user's compounded deposit and BTC gain from one checked block", async () => {
    const { rpc, calls } = client();
    const snapshot = await readStabilityPoolSnapshot({ network: NETWORK, owner: ACCOUNT, rpc, nowMs: NOW_MS });
    assert.equal(snapshot.chainId, 31611);
    assert.equal(snapshot.blockNumber, BLOCK_NUMBER);
    assert.equal(snapshot.compoundedDeposit, 420n * WAD);
    assert.equal(snapshot.collateralGain, 3n * WAD / 10n);
    assert.equal(snapshot.totalMUSDDeposits, 1_000n * WAD);
    assert.equal(snapshot.poolCollateral, 4n * WAD);
    assert.ok(calls.some((call) => call.method === "eth_getStorageAt"));
    const pinned = calls.filter((call) => call.method === "eth_call" || call.method === "eth_getCode" || call.method === "eth_getStorageAt");
    assert.ok(pinned.length > 0 && pinned.every((call) => call.params.at(-1) === BLOCK));
  });

  it("prepares only an exact MUSD allowance when the live allowance is short", async () => {
    const { review, calls } = await prepare();
    assert.equal(review.action, "approve");
    assert.equal(review.transaction.to.toLowerCase(), NETWORK.musd!.address.toLowerCase());
    assert.equal(review.transaction.data, `${S.approve}${addressWord(C.proxy)}${word(2n * WAD)}`);
    assert.equal(review.transaction.value, "0x0");
    assert.equal(review.snapshot.allowance, 0n);
    assert.ok(calls.some((call) => call.method === "eth_estimateGas"));
    assert.ok(calls.some((call) => call.method === "eth_call" && (call.params[0] as { data?: string }).data?.startsWith(S.approve)));
    assert.equal(calls.some((call) => call.method === "eth_sendTransaction"), false);
  });

  it("prepares a deposit only when an exact or greater live allowance already exists", async () => {
    const { review } = await prepare({ allowance: 3n * WAD });
    assert.equal(review.action, "deposit");
    assert.equal(review.transaction.to.toLowerCase(), C.proxy.toLowerCase());
    assert.equal(review.transaction.data, `${S.provideToSP}${word(2n * WAD)}`);
    assert.equal(review.transaction.value, "0x0");
  });

  it("blocks wrong chain, changed implementation, missing code, or mismatched pool token before estimate", async () => {
    for (const options of [
      { chainId: "0x7b7c" },
      { implementation: "0x2222222222222222222222222222222222222222" },
      { codeAddress: C.implementation },
      { poolToken: "0x3333333333333333333333333333333333333333" },
    ]) {
      const { rpc, calls } = client(options);
      await assert.rejects(prepareStabilityPoolAction({ network: NETWORK, account: ACCOUNT, walletChainId: 31611, amount: "2", rpc, nowMs: NOW_MS }), StabilityPoolError);
      assert.equal(calls.some((call) => call.method === "eth_estimateGas"), false);
      assert.equal(calls.some((call) => call.method === "eth_sendTransaction"), false);
    }
  });

  it("blocks malformed, stale, out-of-balance, or invalid approval simulation inputs", async () => {
    for (const amount of ["0", "-1", "1e3", "1.0000000000000000001", "."]) {
      const { rpc, calls } = client();
      await assert.rejects(prepareStabilityPoolAction({ network: NETWORK, account: ACCOUNT, walletChainId: 31611, amount, rpc, nowMs: NOW_MS }), StabilityPoolError);
      assert.equal(calls.some((call) => call.method === "eth_estimateGas"), false);
    }
    const insufficient = client({ balance: WAD });
    await assert.rejects(prepareStabilityPoolAction({ network: NETWORK, account: ACCOUNT, walletChainId: 31611, amount: "2", rpc: insufficient.rpc, nowMs: NOW_MS }), /exceeds/);
    const stale = client({ timestamp: NOW_SECONDS - 121 });
    await assert.rejects(readStabilityPoolSnapshot({ network: NETWORK, owner: ACCOUNT, rpc: stale.rpc, nowMs: NOW_MS }), /stale/);
    for (const options of [{ approveResult: encodeUintResult(0n) }, { failEstimate: true }, { failSimulation: true }]) {
      const { rpc, calls } = client(options);
      await assert.rejects(prepareStabilityPoolAction({ network: NETWORK, account: ACCOUNT, walletChainId: 31611, amount: "2", rpc, nowMs: NOW_MS }), StabilityPoolError);
      assert.equal(calls.some((call) => call.method === "eth_sendTransaction"), false);
    }
  });

  it("requires re-review when any material snapshot or gas value changes, but not merely a later block", async () => {
    const a = (await prepare({ allowance: 3n * WAD })).review;
    const laterBlock = { ...a, snapshot: { ...a.snapshot, blockNumber: a.snapshot.blockNumber + 1 } };
    assert.equal(sameStabilityPoolReview(a, laterBlock), true);
    const changed = { ...a, snapshot: { ...a.snapshot, allowance: a.snapshot.allowance + 1n } };
    assert.equal(sameStabilityPoolReview(a, changed), false);
  });
});

describe("Stability Pool receipt verification", () => {
  it("confirms exact approval and deposit receipts only with matching contract events", async () => {
    for (const action of ["approve", "deposit"] as const) {
      const allowance = action === "approve" ? 0n : 3n * WAD;
      const { review, rpc } = await prepare({ allowance });
      const accountTopic = `0x${addressWord(ACCOUNT)}`;
      const poolTopic = `0x${addressWord(C.proxy)}`;
      const token = NETWORK.musd!.address;
      const logs = action === "approve" ? [
        { address: token, topics: [APPROVAL_TOPIC, accountTopic, poolTopic], data: `0x${word(review.amountWei)}` },
      ] : [
        { address: C.proxy, topics: [USER_TOPIC, accountTopic], data: `0x${word(review.amountWei + 420n * WAD)}` },
        { address: C.proxy, topics: [GAIN_TOPIC, accountTopic], data: `0x${word(0n)}${word(0n)}` },
        { address: token, topics: [TRANSFER_TOPIC, accountTopic, poolTopic], data: `0x${word(review.amountWei)}` },
      ];
      const mock = fakeFetch((method) => {
        if (method === "eth_getTransactionReceipt") return { transactionHash: HASH, from: ACCOUNT, to: review.transaction.to, status: "0x1", blockNumber: "0x200", logs };
        if (method === "eth_getTransactionByHash") return { hash: HASH, from: ACCOUNT, to: review.transaction.to, input: review.transaction.data, value: "0x0", gas: review.transaction.gas };
        return new Error(`unexpected ${method}`);
      });
      const receiptRpc = createRpcClient({ url: NETWORK.rpcUrl, fetchImpl: mock.fetchImpl });
      assert.deepEqual(await readStabilityPoolReceipt({ rpc: receiptRpc, hash: HASH, expected: review }), { status: "confirmed", blockNumber: 512 });
      assert.equal(mock.calls.some((call) => call.method === "eth_sendTransaction"), false);
      void rpc;
    }
  });

  it("does not call a deposit confirmed when required events are absent", async () => {
    const { review } = await prepare({ allowance: 3n * WAD });
    const mock = fakeFetch((method) => method === "eth_getTransactionReceipt"
      ? { transactionHash: HASH, from: ACCOUNT, to: review.transaction.to, status: "0x1", blockNumber: "0x200", logs: [] }
      : method === "eth_getTransactionByHash"
        ? { hash: HASH, from: ACCOUNT, to: review.transaction.to, input: review.transaction.data, value: "0x0", gas: review.transaction.gas }
        : new Error(`unexpected ${method}`));
    const rpc = createRpcClient({ url: NETWORK.rpcUrl, fetchImpl: mock.fetchImpl });
    await assert.rejects(readStabilityPoolReceipt({ rpc, hash: HASH, expected: review }), /matching Stability Pool deposit/);
  });
});
