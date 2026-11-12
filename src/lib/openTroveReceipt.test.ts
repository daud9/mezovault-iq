import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MEZO_NETWORKS } from "../config/chains";
import type { RpcClient } from "./rpc";
import { OpenTroveReceiptError, readOpenTroveReceipt } from "./openTroveReceipt";
import type { OpenTroveTransaction } from "./openTroveExecution";

const ACCOUNT = "0x1111111111111111111111111111111111111111" as const;
const HASH = `0x${"a".repeat(64)}`;
const DATA = `0x2f3a6d98${"0".repeat(64)}${"0".repeat(128)}`;
const VALUE = "0xb1a2bc2ec50000";
const TROVE_CREATED_TOPIC = "0x59cfd0cd754bc5748b6770e94a4ffa5f678d885cb899dcfadc5734edb97c67ab";
const BORROWER_TOPIC = `0x${ACCOUNT.slice(2).toLowerCase().padStart(64, "0")}`;
const TX: OpenTroveTransaction = {
  from: ACCOUNT,
  to: MEZO_NETWORKS.testnet.borrowerOperations!.address,
  data: DATA,
  value: VALUE,
  gas: "0x927c94",
};

interface FixtureOptions {
  receipt?: unknown;
  transaction?: unknown;
}

function fixture(options: FixtureOptions = {}): { rpc: RpcClient; calls: string[] } {
  const calls: string[] = [];
  const receipt = options.receipt === undefined ? {
    transactionHash: HASH,
    from: ACCOUNT,
    to: TX.to,
    status: "0x1",
    blockNumber: "0x100",
    logs: [{ address: TX.to, topics: [TROVE_CREATED_TOPIC, BORROWER_TOPIC], data: `0x${"0".repeat(64)}` }],
  } : options.receipt;
  const transaction = options.transaction === undefined ? {
    hash: HASH,
    from: ACCOUNT,
    to: TX.to,
    input: DATA,
    value: VALUE,
    gas: TX.gas,
  } : options.transaction;
  const rpc: RpcClient = {
    async call<T>(method: string): Promise<T> {
      calls.push(method);
      if (method === "eth_getTransactionReceipt") return receipt as T;
      if (method === "eth_getTransactionByHash") return transaction as T;
      throw new Error(`Unexpected method ${method}`);
    },
  };
  return { rpc, calls };
}

describe("open-Trove receipt verification", () => {
  it("confirms only the exact matching transaction with a successful receipt", async () => {
    const { rpc, calls } = fixture();
    assert.deepEqual(await readOpenTroveReceipt({ rpc, hash: HASH, expected: TX }), { status: "confirmed", blockNumber: 256 });
    assert.deepEqual(calls, ["eth_getTransactionReceipt", "eth_getTransactionByHash"]);
  });

  it("reports a matched reverted receipt as reverted, not successful", async () => {
    const { rpc } = fixture({ receipt: {
      transactionHash: HASH,
      from: ACCOUNT,
      to: TX.to,
      status: "0x0",
      blockNumber: "0x101",
    } });
    assert.deepEqual(await readOpenTroveReceipt({ rpc, hash: HASH, expected: TX }), { status: "reverted", blockNumber: 257 });
  });

  it("requires the BorrowerOperations TroveCreated event for the reviewed borrower", async () => {
    const baseReceipt = { transactionHash: HASH, from: ACCOUNT, to: TX.to, status: "0x1", blockNumber: "0x100" };
    const missing = fixture({ receipt: { ...baseReceipt, logs: [] } });
    await assert.rejects(readOpenTroveReceipt({ rpc: missing.rpc, hash: HASH, expected: TX }), /TroveCreated event/);

    const wrongBorrower = fixture({ receipt: { ...baseReceipt, logs: [{ address: TX.to, topics: [TROVE_CREATED_TOPIC, `0x${"2".repeat(64)}`], data: `0x${"0".repeat(64)}` }] } });
    await assert.rejects(readOpenTroveReceipt({ rpc: wrongBorrower.rpc, hash: HASH, expected: TX }), /TroveCreated event/);

    const wrongContract = fixture({ receipt: { ...baseReceipt, logs: [{ address: "0x2222222222222222222222222222222222222222", topics: [TROVE_CREATED_TOPIC, BORROWER_TOPIC], data: `0x${"0".repeat(64)}` }] } });
    await assert.rejects(readOpenTroveReceipt({ rpc: wrongContract.rpc, hash: HASH, expected: TX }), /TroveCreated event/);
  });

  it("keeps a missing receipt pending and does not look up transaction details yet", async () => {
    const { rpc, calls } = fixture({ receipt: null });
    assert.deepEqual(await readOpenTroveReceipt({ rpc, hash: HASH, expected: TX }), { status: "pending" });
    assert.deepEqual(calls, ["eth_getTransactionReceipt"]);
  });

  it("rejects invalid or mismatched receipt and transaction identifiers", async () => {
    const badReceipt = fixture({ receipt: { transactionHash: `0x${"b".repeat(64)}`, from: ACCOUNT, to: TX.to, status: "0x1", blockNumber: "0x100" } });
    await assert.rejects(readOpenTroveReceipt({ rpc: badReceipt.rpc, hash: HASH, expected: TX }), OpenTroveReceiptError);
    await assert.rejects(readOpenTroveReceipt({ rpc: fixture().rpc, hash: "0x1234", expected: TX }), OpenTroveReceiptError);
  });

  it("rejects a receipt from a different account or contract", async () => {
    const wrongFrom = fixture({ receipt: { transactionHash: HASH, from: "0x2222222222222222222222222222222222222222", to: TX.to, status: "0x1", blockNumber: "0x100" } });
    await assert.rejects(readOpenTroveReceipt({ rpc: wrongFrom.rpc, hash: HASH, expected: TX }), /sender or target/);
    const wrongTo = fixture({ receipt: { transactionHash: HASH, from: ACCOUNT, to: "0x2222222222222222222222222222222222222222", status: "0x1", blockNumber: "0x100" } });
    await assert.rejects(readOpenTroveReceipt({ rpc: wrongTo.rpc, hash: HASH, expected: TX }), /sender or target/);
  });

  it("rejects a mined transaction whose sender, target, calldata, native value, or gas limit changed", async () => {
    const cases = [
      { from: "0x2222222222222222222222222222222222222222" },
      { to: "0x2222222222222222222222222222222222222222" },
      { input: "0x12345678" },
      { value: "0x0" },
      { gas: "0x927c95" },
    ];
    for (const change of cases) {
      const { rpc } = fixture({ transaction: { hash: HASH, from: ACCOUNT, to: TX.to, input: DATA, value: VALUE, gas: TX.gas, ...change } });
      await assert.rejects(readOpenTroveReceipt({ rpc, hash: HASH, expected: TX }), OpenTroveReceiptError);
    }
  });

  it("does not claim a receipt when status or block is malformed or unrecognized", async () => {
    const badStatus = fixture({ receipt: { transactionHash: HASH, from: ACCOUNT, to: TX.to, status: "0x2", blockNumber: "0x100" } });
    await assert.rejects(readOpenTroveReceipt({ rpc: badStatus.rpc, hash: HASH, expected: TX }), /status is unrecognized/);
    const badBlock = fixture({ receipt: { transactionHash: HASH, from: ACCOUNT, to: TX.to, status: "0x1", blockNumber: "latest" } });
    await assert.rejects(readOpenTroveReceipt({ rpc: badBlock.rpc, hash: HASH, expected: TX }), /block number could not be verified/);
  });
});
