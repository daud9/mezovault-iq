import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readSnapshotBlock } from "./readSnapshotBlock";
import { createRpcClient } from "./rpc";
import { fakeFetch } from "./testHelpers";

describe("snapshot block tag", () => {
  it("returns the canonical tag and safe decimal height", async () => {
    const rpc = createRpcClient({
      url: "https://rpc.example",
      fetchImpl: fakeFetch((method) => method === "eth_blockNumber" ? "0x00020" : new Error(`unexpected ${method}`)).fetchImpl,
    });
    assert.deepEqual(await readSnapshotBlock(rpc), { blockTag: "0x20", blockNumber: 32 });
  });

  it("rejects malformed and unsafe block heights", async () => {
    for (const value of ["latest", "0x", `0x${(BigInt(Number.MAX_SAFE_INTEGER) + 1n).toString(16)}`]) {
      const rpc = createRpcClient({
        url: "https://rpc.example",
        fetchImpl: fakeFetch((method) => method === "eth_blockNumber" ? value : new Error(`unexpected ${method}`)).fetchImpl,
      });
      await assert.rejects(readSnapshotBlock(rpc));
    }
  });
});
