import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toEventSelector } from "viem";
import { MEZO_NETWORKS } from "../config/chains";
import type { RpcClient } from "./rpc";
import { encodeAddCollateralCalldata, type AddCollateralTransaction } from "./addCollateralExecution";
import { AddCollateralReceiptError, readAddCollateralReceipt } from "./addCollateralReceipt";

const ACCOUNT = "0x1111111111111111111111111111111111111111" as const;
const HASH = `0x${"a".repeat(64)}`;
const DATA = encodeAddCollateralCalldata();
const VALUE = "0x7ce66c50e284000";
const TROVE_UPDATED_TOPIC = toEventSelector("TroveUpdated(address,uint256,uint256,uint256,uint256,uint16,uint256,uint8)");
const BORROWER_TOPIC = `0x${ACCOUNT.slice(2).toLowerCase().padStart(64, "0")}`;
const TX: AddCollateralTransaction = {
  from: ACCOUNT,
  to: MEZO_NETWORKS.testnet.borrowerOperations!.address,
  data: DATA,
  value: VALUE,
  gas: "0x927c94",
};

function eventData(operation = 2n) {
  const words = [0n, 0n, 2n * 10n ** 18n, 1n, 1n, 1n, operation];
  return `0x${words.map((word) => word.toString(16).padStart(64, "0")).join("")}`;
}

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
    logs: [{ address: TX.to, topics: [TROVE_UPDATED_TOPIC, BORROWER_TOPIC], data: eventData() }],
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

describe("add-collateral receipt verification", () => {
  it("confirms the exact payable addColl request with matching TroveUpdated(adjustTrove) log", async () => {
    const { rpc, calls } = fixture();
    assert.deepEqual(await readAddCollateralReceipt({ rpc, hash: HASH, expected: TX }), { status: "confirmed", blockNumber: 256 });
    assert.deepEqual(calls, ["eth_getTransactionReceipt", "eth_getTransactionByHash"]);
  });

  it("reports a matching reverted receipt without claiming collateral was added", async () => {
    const { rpc } = fixture({ receipt: {
      transactionHash: HASH,
      from: ACCOUNT,
      to: TX.to,
      status: "0x0",
      blockNumber: "0x101",
      logs: [],
    } });
    assert.deepEqual(await readAddCollateralReceipt({ rpc, hash: HASH, expected: TX }), { status: "reverted", blockNumber: 257 });
  });

  it("requires the expected borrower, addColl emitter, and adjustTrove operation event", async () => {
    const base = { transactionHash: HASH, from: ACCOUNT, to: TX.to, status: "0x1", blockNumber: "0x100" };
    const cases = [
      { logs: [] },
      { logs: [{ address: TX.to, topics: [TROVE_UPDATED_TOPIC, `0x${"2".repeat(64)}`], data: eventData() }] },
      { logs: [{ address: "0x2222222222222222222222222222222222222222", topics: [TROVE_UPDATED_TOPIC, BORROWER_TOPIC], data: eventData() }] },
      { logs: [{ address: TX.to, topics: [TROVE_UPDATED_TOPIC, BORROWER_TOPIC], data: eventData(1n) }] },
      { logs: [{ address: TX.to, topics: [TROVE_UPDATED_TOPIC, BORROWER_TOPIC], data: "0x1234" }] },
    ];
    for (const extra of cases) {
      await assert.rejects(readAddCollateralReceipt({ rpc: fixture({ receipt: { ...base, ...extra } }).rpc, hash: HASH, expected: TX }), /matching TroveUpdated\(adjustTrove\) event/);
    }
  });

  it("keeps missing receipts pending and rejects altered transaction details", async () => {
    assert.deepEqual(await readAddCollateralReceipt({ rpc: fixture({ receipt: null }).rpc, hash: HASH, expected: TX }), { status: "pending" });
    for (const change of [
      { from: "0x2222222222222222222222222222222222222222" },
      { to: "0x2222222222222222222222222222222222222222" },
      { input: "0x12345678" },
      { value: "0x0" },
      { gas: "0x927c95" },
    ]) {
      const { rpc } = fixture({ transaction: { hash: HASH, from: ACCOUNT, to: TX.to, input: DATA, value: VALUE, gas: TX.gas, ...change } });
      await assert.rejects(readAddCollateralReceipt({ rpc, hash: HASH, expected: TX }), AddCollateralReceiptError);
    }
  });

  it("rejects malformed hashes, receipt status, and block numbers", async () => {
    await assert.rejects(readAddCollateralReceipt({ rpc: fixture().rpc, hash: "0x1234", expected: TX }), AddCollateralReceiptError);
    const badStatus = fixture({ receipt: { transactionHash: HASH, from: ACCOUNT, to: TX.to, status: "0x2", blockNumber: "0x100" } });
    await assert.rejects(readAddCollateralReceipt({ rpc: badStatus.rpc, hash: HASH, expected: TX }), /status is unrecognized/);
    const badBlock = fixture({ receipt: { transactionHash: HASH, from: ACCOUNT, to: TX.to, status: "0x1", blockNumber: "latest" } });
    await assert.rejects(readAddCollateralReceipt({ rpc: badBlock.rpc, hash: HASH, expected: TX }), /block number could not be verified/);
  });
});
