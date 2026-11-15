import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isActivityContextCurrent, receiptMatchesRequestedHash, verifyActivityRpcChain, withVerifiedActivityChain } from "./activityRpc";
import type { RpcClient } from "./rpc";

describe("Activity RPC chain verification", () => {
  it("accepts only the selected chain ID returned as a valid quantity", async () => {
    const calls: string[] = [];
    const rpc: RpcClient = { call: async (method) => { calls.push(method); return "0x7b7b"; } };
    await verifyActivityRpcChain(rpc, 31_611);
    assert.deepEqual(calls, ["eth_chainId"]);
  });

  it("rejects a wrong, malformed, or unavailable chain ID", async () => {
    for (const response of ["0x7b7c", "0x07b7b", "not-hex", null, undefined]) {
      const rpc: RpcClient = { call: async () => response };
      await assert.rejects(verifyActivityRpcChain(rpc, 31_611));
    }
    const unavailable: RpcClient = { call: async () => { throw new Error("offline"); } };
    await assert.rejects(verifyActivityRpcChain(unavailable, 31_611), /offline/);
  });

  it("does not run a protected read when the reported chain is wrong or malformed", async () => {
    for (const response of ["0x7b7c", "malformed"]) {
      let reads = 0;
      const rpc: RpcClient = { call: async () => response };
      await assert.rejects(withVerifiedActivityChain(rpc, 31_611, async () => { reads += 1; }));
      assert.equal(reads, 0);
    }
  });
});

describe("Activity transfer context visibility", () => {
  it("hides history until its loaded wallet and network match the selected context", () => {
    assert.equal(isActivityContextCurrent("31611:0xaaa", "31611:0xbbb"), false);
    assert.equal(isActivityContextCurrent("31611:0xaaa", "1:0xaaa"), false);
    assert.equal(isActivityContextCurrent("31611:0xaaa", null), false);
    assert.equal(isActivityContextCurrent("31611:0xaaa", "31611:0xaaa"), true);
  });
});

describe("Activity receipt hash matching", () => {
  const requested = `0x${"a".repeat(64)}`;

  it("accepts an exact or case-insensitive matching transaction hash", () => {
    assert.equal(receiptMatchesRequestedHash({ transactionHash: requested }, requested), true);
    assert.equal(receiptMatchesRequestedHash({ transactionHash: requested.toUpperCase().replace("0X", "0x") }, requested), true);
  });

  it("rejects missing, malformed, or mismatched transaction hashes", () => {
    assert.equal(receiptMatchesRequestedHash({}, requested), false);
    assert.equal(receiptMatchesRequestedHash({ transactionHash: null }, requested), false);
    assert.equal(receiptMatchesRequestedHash({ transactionHash: `0x${"b".repeat(64)}` }, requested), false);
    assert.equal(receiptMatchesRequestedHash(null, requested), false);
  });
});
