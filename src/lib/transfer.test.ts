import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildTransfer,
  doesSendReviewMatchDraft,
  describeSendError,
  isTxHash,
  nativeTotalCost,
  parseAmount,
  simulateErc20Transfer,
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

describe("Send review draft integrity", () => {
  const review = {
    recipient: TO,
    amountRaw: 1_500_000_000_000_000_000n,
    token: { kind: "erc20", symbol: "MUSD", decimals: 18, address: TOKEN },
  } as const;

  it("accepts the same exact transfer even when decimal formatting differs", () => {
    assert.equal(doesSendReviewMatchDraft(review, { recipient: TO, amountText: "1.5000", tokenSymbol: "MUSD" }), true);
  });

  it("invalidates a review when its recipient, token or amount changes", () => {
    assert.equal(doesSendReviewMatchDraft(review, { recipient: FROM, amountText: "1.5", tokenSymbol: "MUSD" }), false);
    assert.equal(doesSendReviewMatchDraft(review, { recipient: TO, amountText: "1.6", tokenSymbol: "MUSD" }), false);
    assert.equal(doesSendReviewMatchDraft(review, { recipient: TO, amountText: "1.5", tokenSymbol: "MEZO" }), false);
    assert.equal(doesSendReviewMatchDraft(review, { recipient: TO, amountText: "1e3", tokenSymbol: "MUSD" }), false);
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

  it("simulates the exact ERC-20 transfer and requires a true boolean result", async () => {
    const tx = buildTransfer({ kind: "erc20", symbol: "MUSD", decimals: 18, address: TOKEN }, FROM, TO, 1n);
    const mock = fakeFetch((method, params) => {
      assert.equal(method, "eth_call");
      assert.deepEqual(params, [{ from: FROM, to: TOKEN, data: tx.data, value: "0x0" }]);
      return `0x${"0".repeat(63)}1`;
    });
    await simulateErc20Transfer(createRpcClient({ url: "https://rpc.example", fetchImpl: mock.fetchImpl }), tx);

    for (const result of [`0x${"0".repeat(64)}`, "0x", `0x${"0".repeat(63)}2`]) {
      const failed = createRpcClient({ url: "https://rpc.example", fetchImpl: fakeFetch(() => result).fetchImpl });
      await assert.rejects(simulateErc20Transfer(failed, tx));
    }
  });

  it("computes the total BTC a native send needs", () => {
    assert.equal(nativeTotalCost(100n, 21_000n, 10n), 100n + 210_000n);
  });
});

describe("receipt polling", () => {
  const expected = { chainId: 31_611, transaction: { from: FROM, to: TO, value: "0x1" } };
  const receiptHandler = (
    receipts: (object | null)[],
    overrides: { chainId?: string; transaction?: Record<string, unknown>; receipt?: Record<string, unknown> } = {},
  ): Handler => {
    let i = 0;
    return (method) => {
      if (method === "eth_chainId") return overrides.chainId ?? "0x7b7b";
      if (method === "eth_getTransactionByHash") return {
        hash: HASH, from: FROM, to: TO, value: "0x1", input: "0x", ...overrides.transaction,
      };
      if (method === "eth_getTransactionReceipt") {
        const r = receipts[Math.min(i, receipts.length - 1)];
        i++;
        return r === null ? null : { transactionHash: HASH, ...r, ...overrides.receipt };
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
      expected,
      sleep: noSleep,
    });
    assert.equal(out.status, "success");
    if (out.status === "success") assert.equal(out.blockNumber, 16);
  });

  it("reports reverted for status 0x0", async () => {
    const out = await waitForReceipt({
      rpc: rpcFor(receiptHandler([{ status: "0x0", blockNumber: "0x10", gasUsed: "0x5208" }])),
      hash: HASH,
      expected,
      sleep: noSleep,
    });
    assert.equal(out.status, "reverted");
  });

  it("does not call an unknown receipt status a revert", async () => {
    await assert.rejects(waitForReceipt({
      rpc: rpcFor(receiptHandler([{ status: "0x2", blockNumber: "0x10", gasUsed: "0x5208" }])),
      hash: HASH,
      expected,
      sleep: noSleep,
    }), /unknown transaction receipt status/);
  });

  it("rejects malformed receipt quantities instead of claiming a result", async () => {
    await assert.rejects(waitForReceipt({
      rpc: rpcFor(receiptHandler([{ status: "garbage", blockNumber: "0x10", gasUsed: "0x5208" }])),
      hash: HASH,
      expected,
      sleep: noSleep,
    }), /invalid receipt status/);
  });

  it("waits while the receipt is missing, then succeeds", async () => {
    const out = await waitForReceipt({
      rpc: rpcFor(receiptHandler([null, null, { status: "0x1", blockNumber: "0x2", gasUsed: "0x1" }])),
      hash: HASH,
      expected,
      sleep: noSleep,
    });
    assert.equal(out.status, "success");
  });

  it("reports timeout, not failure, when no receipt arrives", async () => {
    const out = await waitForReceipt({
      rpc: rpcFor(receiptHandler([null])),
      hash: HASH,
      expected,
      intervalMs: 1,
      timeoutMs: 0,
      sleep: noSleep,
    });
    assert.equal(out.status, "timeout");
  });

  it("rejects a wrong RPC chain or any hash, sender, target, or receipt-hash mismatch", async () => {
    for (const overrides of [
      { chainId: "0x1" },
      { transaction: { hash: `0x${"b".repeat(64)}` } },
      { transaction: { from: TO } },
      { transaction: { to: FROM } },
      { receipt: { transactionHash: `0x${"b".repeat(64)}` } },
    ]) {
      await assert.rejects(waitForReceipt({
        rpc: rpcFor(receiptHandler([{ status: "0x1", blockNumber: "0x10", gasUsed: "0x5208" }], overrides)),
        hash: HASH,
        expected,
        sleep: noSleep,
      }));
    }
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
