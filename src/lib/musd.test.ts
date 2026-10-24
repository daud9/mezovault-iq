import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readMusdBalance } from "./musd";
import { createRpcClient } from "./rpc";
import { MEZO_NETWORKS } from "../config/chains";
import { fakeFetch, encodeStringResult, encodeUintResult, OWNER, type Handler } from "./testHelpers";

const TESTNET = MEZO_NETWORKS.testnet;
const FIXED_NOW = () => new Date("2026-10-24T12:00:00.000Z");

/** A healthy testnet: correct chain, real token code, 18 decimals, MUSD symbol. */
function healthy(overrides: Partial<Record<string, unknown>> = {}): Handler {
  return (method, params) => {
    if (method === "eth_chainId") return overrides.chainId ?? "0x7b7b";
    if (method === "eth_getCode") return overrides.code ?? "0x6080604052";
    if (method === "eth_blockNumber") return "0x10";
    if (method === "eth_call") {
      const data = (params[0] as { data: string }).data;
      if (data.startsWith("0x313ce567")) return overrides.decimals ?? encodeUintResult(18n);
      if (data.startsWith("0x95d89b41")) return overrides.symbol ?? encodeStringResult("MUSD");
      if (data.startsWith("0x70a08231")) return overrides.balance ?? encodeUintResult(1_500_000_000_000_000_000n);
    }
    return new Error(`unexpected ${method}`);
  };
}

function run(handler: Handler, network = TESTNET, owner = OWNER) {
  const { fetchImpl, calls } = fakeFetch(handler);
  const rpc = createRpcClient({ url: network.rpcUrl, fetchImpl });
  return { result: readMusdBalance({ network, owner, rpc, now: FIXED_NOW }), calls };
}

describe("MUSD balance: successful reads", () => {
  it("returns the formatted balance with its exact value, symbol and freshness", async () => {
    const { result } = run(healthy());
    const r = await result;
    assert.equal(r.status, "ok");
    if (r.status !== "ok") return;
    assert.equal(r.balanceRaw, 1_500_000_000_000_000_000n);
    assert.equal(r.formatted, "1.5");
    assert.equal(r.exact, "1.5");
    assert.equal(r.symbol, "MUSD");
    assert.equal(r.decimals, 18);
    assert.equal(r.tokenAddress, TESTNET.musd?.address);
    assert.equal(r.chainId, 31611);
    assert.equal(r.blockNumber, 16);
    assert.equal(r.retrievedAt, "2026-10-24T12:00:00.000Z");
  });

  it("reports a zero balance as a valid zero, not an error", async () => {
    const r = await run(healthy({ balance: encodeUintResult(0n) })).result;
    assert.equal(r.status, "ok");
    if (r.status === "ok") {
      assert.equal(r.formatted, "0");
      assert.equal(r.balanceRaw, 0n);
    }
  });

  it("reads the balance of the owner that was passed in", async () => {
    const { fetchImpl, calls } = fakeFetch(healthy());
    const rpc = createRpcClient({ url: TESTNET.rpcUrl, fetchImpl });
    await readMusdBalance({ network: TESTNET, owner: OWNER, rpc, now: FIXED_NOW });
    const balanceCall = calls.find(
      (c) => c.method === "eth_call" && (c.params[0] as { data: string }).data.startsWith("0x70a08231"),
    );
    assert.ok(balanceCall, "balanceOf must be called");
    assert.ok((balanceCall!.params[0] as { data: string }).data.endsWith(OWNER.slice(2).toLowerCase()));
  });
});

describe("MUSD balance: missing configuration", () => {
  it("reports not-configured when no verified token address is recorded", async () => {
    const network = { ...TESTNET, musd: null };
    const r = await run(healthy(), network).result;
    assert.equal(r.status, "not-configured");
  });

  it("does not contact the RPC when configuration is missing", async () => {
    const network = { ...TESTNET, musd: null };
    const { result, calls } = run(healthy(), network);
    await result;
    assert.equal(calls.length, 0);
  });

  it("rejects an invalid owner address before any request", async () => {
    const r = await run(healthy(), TESTNET, "not-an-address").result;
    assert.equal(r.status, "error");
    if (r.status === "error") assert.equal(r.kind, "invalid-input");
  });
});

describe("MUSD balance: network verification", () => {
  it("reports wrong-network when the wallet is on mainnet", async () => {
    const r = await run(healthy({ chainId: "0x7b7c" })).result;
    assert.equal(r.status, "wrong-network");
    if (r.status === "wrong-network") {
      assert.equal(r.actualChainId, 31612);
      assert.equal(r.expectedChainId, 31611);
    }
  });

  it("reports wrong-network when the chain id is unparseable", async () => {
    const r = await run(healthy({ chainId: "garbage" })).result;
    assert.equal(r.status, "wrong-network");
    if (r.status === "wrong-network") assert.equal(r.actualChainId, null);
  });

  it("does not read balances after a wrong network", async () => {
    const { calls, result } = run(healthy({ chainId: "0x1" }));
    await result;
    assert.equal(calls.some((c) => c.method === "eth_call"), false);
  });
});

describe("MUSD balance: contract verification", () => {
  it("reports no-contract when the address has no code", async () => {
    const r = await run(healthy({ code: "0x" })).result;
    assert.equal(r.status, "no-contract");
  });

  it("refuses to format a balance when decimals differ from 18", async () => {
    const r = await run(healthy({ decimals: encodeUintResult(6n) })).result;
    assert.equal(r.status, "error");
    if (r.status === "error") {
      assert.equal(r.kind, "token-mismatch");
      assert.match(r.message, /not displayed/);
    }
  });

  it("refuses to display a token whose symbol is not MUSD", async () => {
    const r = await run(healthy({ symbol: encodeStringResult("USDC") })).result;
    assert.equal(r.status, "error");
    if (r.status === "error") assert.equal(r.kind, "token-mismatch");
  });
});

describe("MUSD balance: failed RPC requests never produce demo balances", () => {
  it("returns an error result when the endpoint is unreachable", async () => {
    const r = await run(() => new Error("connection refused")).result;
    assert.equal(r.status, "error");
    if (r.status === "error") assert.equal(r.kind, "network");
  });

  it("returns an error result on HTTP failure", async () => {
    const r = await run(() => ({ httpStatus: 502 })).result;
    assert.equal(r.status, "error");
    if (r.status === "error") assert.equal(r.kind, "http");
  });

  it("returns an error result when the balance call reverts", async () => {
    const handler: Handler = (method, params) => {
      if (method === "eth_call" && (params[0] as { data: string }).data.startsWith("0x70a08231")) {
        return undefined; // treated as invalid response
      }
      return healthy()(method, params);
    };
    const r = await run(handler).result;
    assert.equal(r.status, "error");
    if (r.status === "error") assert.equal(r.kind, "invalid-response");
  });

  it("returns an error result when the balance return data is malformed", async () => {
    const r = await run(healthy({ balance: "0x" })).result;
    assert.equal(r.status, "error");
    if (r.status === "error") assert.equal(r.kind, "unknown");
  });

  it("never returns an ok result with a fabricated value after a failure", async () => {
    const r = await run(() => ({ httpStatus: 500 })).result;
    assert.notEqual(r.status, "ok");
  });
});
