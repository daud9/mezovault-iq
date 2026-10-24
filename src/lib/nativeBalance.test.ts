import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readNativeBalance } from "./nativeBalance";
import { createRpcClient } from "./rpc";
import { MEZO_NETWORKS } from "../config/chains";
import { fakeFetch, OWNER, type Handler } from "./testHelpers";

const T = MEZO_NETWORKS.testnet;
const now = () => new Date("2026-10-24T12:00:00.000Z");

function run(handler: Handler) {
  const rpc = createRpcClient({ url: T.rpcUrl, fetchImpl: fakeFetch(handler).fetchImpl });
  return readNativeBalance({ network: T, owner: OWNER, rpc, now });
}

describe("native BTC balance", () => {
  it("formats the balance in BTC with 18 decimals", async () => {
    const r = await run((m) => (m === "eth_chainId" ? "0x7b7b" : m === "eth_blockNumber" ? "0x20" : "0xde0b6b3a7640000"));
    assert.equal(r.status, "ok");
    if (r.status === "ok") {
      assert.equal(r.formatted, "1");
      assert.equal(r.symbol, "BTC");
      assert.equal(r.blockNumber, 32);
      assert.equal(r.retrievedAt, "2026-10-24T12:00:00.000Z");
    }
  });

  it("reports a true zero balance as zero", async () => {
    const r = await run((m) => (m === "eth_chainId" ? "0x7b7b" : m === "eth_blockNumber" ? "0x1" : "0x0"));
    assert.equal(r.status, "ok");
    if (r.status === "ok") assert.equal(r.formatted, "0");
  });

  it("refuses to read on a different network", async () => {
    const r = await run((m) => (m === "eth_chainId" ? "0x7b7c" : "0x0"));
    assert.equal(r.status, "wrong-network");
  });

  it("returns an error, not a value, when the RPC fails", async () => {
    const rpc = createRpcClient({ url: T.rpcUrl, fetchImpl: (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch });
    const r = await readNativeBalance({ network: T, owner: OWNER, rpc });
    assert.equal(r.status, "error");
  });

  it("rejects a malformed balance response", async () => {
    const r = await run((m) => (m === "eth_chainId" ? "0x7b7b" : "not-hex"));
    assert.equal(r.status, "error");
  });
});
