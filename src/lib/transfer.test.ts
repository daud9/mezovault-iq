import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildTransfer,
  describeSendError,
  isTxHash,
  nativeTotalCost,
  parseAmount,
  TRANSFER_SELECTOR,
  validateRecipient,
  waitForReceipt,
} from "./transfer";
import { createRpcClient, RpcError } from "./rpc";
import { fakeFetch, type Handler } from "./testHelpers";

const FROM = "0x1111111111111111111111111111111111111111" as const;
const TO = "0x2222222222222222222222222222222222222222" as const;
const TOKEN = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503" as const;
const HASH = `0x${"ab".repeat(32)}`;

describe("transfer selector", () => {
  it("is the standard ERC-20 transfer selector", () => {
    assert.equal(TRANSFER_SELECTOR, "0xa9059cbb");
  });
});

describe("amount parsing", () => {
  it("converts decimal amounts to base units without rounding", () => {
    assert.deepEqual(parseAmount("1.5", 18), { ok: true, raw: 1_500_000_000_000_000_000n });
    assert.deepEqual(parseAmount("0.000000000000000001", 18), { ok: true, raw: 1n });
    assert.deepEqual(parseAmount("2", 6), { ok: true, raw: 2_000_000n });
  });

  it("rejects too many decimal places", () => {
    assert.equal(parseAmount("1.1234567", 6).ok, false);
  });

  it("rejects zero, empty and malformed input", () => {
    assert.equal(parseAmount("0", 18).ok, false);
    assert.equal(parseAmount("", 18).ok, false);
    assert.equal(parseAmount(".", 18).ok, false);
    assert.equal(parseAmount("1e3", 18).ok, false);
    assert.equal(parseAmount("-1", 18).ok, false);
  });
});

describe("recipient validation", () => {
  it("accepts a valid address", () => {
    assert.equal(validateRecipient(TO, FROM), null);
  });

  it("rejects malformed, zero and self addresses", () => {
    assert.ok(validateRecipient("0x123", FROM));
    assert.ok(validateRecipient("0x0000000000000000000000000000000000000000", FROM));
    assert.ok(validateRecipient(FROM, FROM));
  });
});

describe("transaction building", () => {
  it("builds a native BTC transfer with value and no data", () => {
    const tx = buildTransfer({ kind: "native", symbol: "BTC", decimals: 18 }, FROM, TO, 10n ** 16n);
    assert.equal(tx.to, TO);
    assert.equal(tx.value, `0x${(10n ** 16n).toString(16)}`);
    assert.equal(tx.data, undefined);
  });

  it("builds an ERC-20 transfer that calls the token contract", () => {
    const tx = buildTransfer({ kind: "erc20", symbol: "MUSD", decimals: 18, address: TOKEN }, FROM, TO, 1_500_000_000_000_000_000n);
    assert.equal(tx.to, TOKEN);
    assert.equal(tx.value, "0x0");
    assert.equal(
      tx.data,
      `0xa9059cbb000000000000000000000000${TO.slice(2).toLowerCase()}${(1_500_000_000_000_000_000n).toString(16).padStart(64, "0")}`,
    );
    assert.equal(tx.data!.length, 2 + 8 + 64 + 64);
  });

  it("computes the total BTC a native send needs", () => {
    assert.equal(nativeTotalCost(100n, 21_000n, 10n), 100n + 210_000n);
  });
});

describe("receipt polling", () => {
  const receiptHandler = (receipts: (object | null)[]): Handler => {
    let i = 0;
    return (method) => {
      if (method === "eth_getTransactionReceipt") {
        const r = receipts[Math.min(i, receipts.length - 1)];
        i++;
        return r;
      }
      return new Error(`unexpected ${method}`);
    };
  };
  const noSleep = async () => {};
  const rpcFor = (h: Handler) => createRpcClient({ url: "https://rpc.example", fetchImpl: fakeFetch(h).fetchImpl });

  it("reports success only for status 0x1", async () => {
    const out = await waitForReceipt({
      rpc: rpcFor(receiptHandler([{ status: "0x1", blockNumber: "0x10", gasUsed: "0x5208" }])),
      hash: HASH,
      sleep: noSleep,
    });
    assert.equal(out.status, "success");
    if (out.status === "success") assert.equal(out.blockNumber, 16);
  });

  it("reports reverted for status 0x0", async () => {
    const out = await waitForReceipt({
      rpc: rpcFor(receiptHandler([{ status: "0x0", blockNumber: "0x10", gasUsed: "0x5208" }])),
      hash: HASH,
      sleep: noSleep,
    });
    assert.equal(out.status, "reverted");
  });

  it("waits while the receipt is missing, then succeeds", async () => {
    const out = await waitForReceipt({
      rpc: rpcFor(receiptHandler([null, null, { status: "0x1", blockNumber: "0x2", gasUsed: "0x1" }])),
      hash: HASH,
      sleep: noSleep,
    });
    assert.equal(out.status, "success");
  });

  it("reports timeout, not failure, when no receipt arrives", async () => {
    const out = await waitForReceipt({
      rpc: rpcFor(receiptHandler([null])),
      hash: HASH,
      intervalMs: 1,
      timeoutMs: 0,
      sleep: noSleep,
    });
    assert.equal(out.status, "timeout");
  });
});

describe("error messages", () => {
  it("explains a rejected signature", () => {
    assert.match(describeSendError(Object.assign(new Error("x"), { code: 4001 })), /rejected/);
  });

  it("explains insufficient funds from the RPC", () => {
    assert.match(describeSendError(new RpcError("rpc", "insufficient funds for gas * price + value")), /Insufficient funds/);
  });

  it("never claims success for an unknown error", () => {
    assert.match(describeSendError(new Error("boom")), /could not be sent/);
  });

  it("validates transaction hashes", () => {
    assert.equal(isTxHash(HASH), true);
    assert.equal(isTxHash("0x1234"), false);
    assert.equal(isTxHash(undefined), false);
  });
});
