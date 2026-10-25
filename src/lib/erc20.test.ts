import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readErc20Balance, type TokenRef } from "./erc20";
import { createRpcClient } from "./rpc";
import { MEZO_NETWORKS } from "../config/chains";
import { fakeFetch, encodeStringResult, encodeUintResult, OWNER, type Handler } from "./testHelpers";

const T = MEZO_NETWORKS.testnet;
const MEZO: TokenRef = { address: "0x7B7c000000000000000000000000000000000001", symbol: "MEZO" };
const now = () => new Date("2026-10-25T09:00:00.000Z");

function tokenHandler(overrides: Partial<Record<string, unknown>> = {}): Handler {
  return (method, params) => {
    if (method === "eth_chainId") return overrides.chainId ?? "0x7b7b";
    if (method === "eth_getCode") return overrides.code ?? "0x6080";
    if (method === "eth_blockNumber") return "0x7";
    if (method === "eth_call") {
      const data = (params[0] as { data: string }).data;
      if (data.startsWith("0x95d89b41")) return overrides.symbol ?? encodeStringResult("MEZO");
      if (data.startsWith("0x313ce567")) return overrides.decimals ?? encodeUintResult(18n);
      if (data.startsWith("0x70a08231")) return overrides.balance ?? encodeUintResult(2_500_000_000_000_000_000n);
    }
    return new Error(`unexpected ${method}`);
  };
}

function run(handler: Handler, token: TokenRef | null = MEZO, network = T) {
  const rpc = createRpcClient({ url: network.rpcUrl, fetchImpl: fakeFetch(handler).fetchImpl });
  return readErc20Balance({ network, token, owner: OWNER, rpc, now });
}

describe("ERC-20 balance reader", () => {
  it("returns the on-chain balance with the on-chain symbol and decimals", async () => {
    const r = await run(tokenHandler());
    assert.equal(r.status, "ok");
    if (r.status === "ok") {
      assert.equal(r.formatted, "2.5");
      assert.equal(r.symbol, "MEZO");
      assert.equal(r.decimals, 18);
      assert.equal(r.retrievedAt, "2026-10-25T09:00:00.000Z");
    }
  });

  it("uses the decimals the contract reports rather than assuming 18", async () => {
    const r = await run(tokenHandler({ decimals: encodeUintResult(6n), balance: encodeUintResult(1_500_000n) }));
    assert.equal(r.status, "ok");
    if (r.status === "ok") assert.equal(r.formatted, "1.5");
  });

  it("reports a true zero as a valid zero", async () => {
    const r = await run(tokenHandler({ balance: encodeUintResult(0n) }));
    assert.equal(r.status, "ok");
    if (r.status === "ok") assert.equal(r.formatted, "0");
  });

  it("is not configured when no verified address is recorded", async () => {
    assert.equal((await run(tokenHandler(), null)).status, "not-configured");
  });

  it("reports wrong-network on a different chain", async () => {
    assert.equal((await run(tokenHandler({ chainId: "0x7b7c" }))).status, "wrong-network");
  });

  it("reports no-contract when nothing is deployed at the address", async () => {
    assert.equal((await run(tokenHandler({ code: "0x" }))).status, "no-contract");
  });

  it("refuses to display a token whose symbol does not match", async () => {
    const r = await run(tokenHandler({ symbol: encodeStringResult("MUSD") }));
    assert.equal(r.status, "error");
    if (r.status === "error") assert.equal(r.kind, "token-mismatch");
  });

  it("returns an error, not a value, when the RPC fails", async () => {
    const rpc = createRpcClient({ url: T.rpcUrl, fetchImpl: (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch });
    const r = await readErc20Balance({ network: T, token: MEZO, owner: OWNER, rpc });
    assert.equal(r.status, "error");
  });

  it("rejects an invalid owner address before any request", async () => {
    const rpc = createRpcClient({ url: T.rpcUrl, fetchImpl: fakeFetch(tokenHandler()).fetchImpl });
    const r = await readErc20Balance({ network: T, token: MEZO, owner: "bad", rpc });
    assert.equal(r.status, "error");
  });
});
