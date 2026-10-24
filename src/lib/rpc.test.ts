import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRpcClient, RpcError } from "./rpc";
import { fakeFetch } from "./testHelpers";

async function expectRpcError(p: Promise<unknown>, kind: string) {
  await assert.rejects(p, (err: unknown) => {
    assert.ok(err instanceof RpcError, "expected an RpcError");
    assert.equal((err as RpcError).kind, kind);
    return true;
  });
}

describe("RPC client: successful calls", () => {
  it("returns the result and sends a JSON-RPC 2.0 body", async () => {
    const { fetchImpl, calls } = fakeFetch((method) => (method === "eth_chainId" ? "0x7b7b" : null));
    const rpc = createRpcClient({ url: "https://rpc.example", fetchImpl });
    assert.equal(await rpc.call("eth_chainId"), "0x7b7b");
    assert.deepEqual(calls, [{ method: "eth_chainId", params: [] }]);
  });
});

describe("RPC client: failure modes", () => {
  it("reports missing configuration without making a request", async () => {
    const { fetchImpl, calls } = fakeFetch(() => "0x1");
    const rpc = createRpcClient({ url: undefined, fetchImpl });
    await expectRpcError(rpc.call("eth_chainId"), "not-configured");
    assert.equal(calls.length, 0);
  });

  it("treats a blank URL as missing configuration", async () => {
    const rpc = createRpcClient({ url: "   ", fetchImpl: fakeFetch(() => "0x1").fetchImpl });
    await expectRpcError(rpc.call("eth_chainId"), "not-configured");
  });

  it("reports a network failure when fetch throws", async () => {
    const rpc = createRpcClient({ url: "https://rpc.example", fetchImpl: fakeFetch(() => new TypeError("fetch failed")).fetchImpl });
    await expectRpcError(rpc.call("eth_chainId"), "network");
  });

  it("reports a timeout when the request is aborted", async () => {
    const slow = (async (_url: string | URL | Request, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    }) as unknown as typeof fetch;
    const rpc = createRpcClient({ url: "https://rpc.example", fetchImpl: slow, timeoutMs: 5 });
    await expectRpcError(rpc.call("eth_chainId"), "timeout");
  });

  it("reports an HTTP error status", async () => {
    const rpc = createRpcClient({ url: "https://rpc.example", fetchImpl: fakeFetch(() => ({ httpStatus: 503 })).fetchImpl });
    await assert.rejects(rpc.call("eth_chainId"), (err: unknown) => {
      assert.equal((err as RpcError).kind, "http");
      assert.equal((err as RpcError).code, 503);
      return true;
    });
  });

  it("reports a JSON-RPC error object with its code and message", async () => {
    const errorBody = (async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "execution reverted" } }), { status: 200 })) as unknown as typeof fetch;
    const rpc = createRpcClient({ url: "https://rpc.example", fetchImpl: errorBody });
    await assert.rejects(rpc.call("eth_call"), (err: unknown) => {
      assert.equal((err as RpcError).kind, "rpc");
      assert.equal((err as RpcError).code, -32000);
      assert.match((err as RpcError).message, /reverted/);
      return true;
    });
  });

  it("rejects a response that is not JSON", async () => {
    const rpc = createRpcClient({ url: "https://rpc.example", fetchImpl: fakeFetch(() => ({ raw: "<html>gateway</html>" })).fetchImpl });
    await expectRpcError(rpc.call("eth_chainId"), "invalid-response");
  });

  it("rejects a response with no result field", async () => {
    const noResult = (async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1 }), { status: 200 })) as unknown as typeof fetch;
    const rpc = createRpcClient({ url: "https://rpc.example", fetchImpl: noResult });
    await expectRpcError(rpc.call("eth_chainId"), "invalid-response");
  });

  it("rejects a response whose id does not match the request", async () => {
    const wrongId = (async () =>
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 999, result: "0x1" }), { status: 200 })) as unknown as typeof fetch;
    const rpc = createRpcClient({ url: "https://rpc.example", fetchImpl: wrongId });
    await expectRpcError(rpc.call("eth_chainId"), "invalid-response");
  });
});
