import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeTransferLog, logFilter, TRANSFER_TOPIC, readRecentTransfers } from "./transferLogs";
import { createRpcClient } from "./rpc";
import { fakeFetch, type Handler } from "./testHelpers";

const OWNER = "0x1111111111111111111111111111111111111111" as const;
const OTHER = "0x2222222222222222222222222222222222222222" as const;
const TOKEN = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503" as const;
const pad = (a: string) => `0x${a.slice(2).toLowerCase().padStart(64, "0")}`;

describe("transfer event topic", () => {
  it("is the standard ERC-20 Transfer topic", () => {
    assert.equal(TRANSFER_TOPIC, "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
  });
});

describe("log filters", () => {
  it("filters incoming transfers by the recipient topic", () => {
    const f = logFilter({ token: TOKEN, owner: OWNER, direction: "incoming", fromBlock: 10, toBlock: 20 });
    assert.deepEqual(f.topics, [TRANSFER_TOPIC, null, pad(OWNER)]);
    assert.equal(f.fromBlock, "0xa");
  });

  it("filters outgoing transfers by the sender topic", () => {
    const f = logFilter({ token: TOKEN, owner: OWNER, direction: "outgoing", fromBlock: 0, toBlock: 1 });
    assert.deepEqual(f.topics, [TRANSFER_TOPIC, pad(OWNER)]);
  });
});

describe("log decoding", () => {
  it("decodes sender, recipient, value and block", () => {
    const log = {
      transactionHash: "0xabc",
      blockNumber: "0x10",
      topics: [TRANSFER_TOPIC, pad(OTHER), pad(OWNER)],
      data: `0x${(1_500_000_000_000_000_000n).toString(16).padStart(64, "0")}`,
    };
    const t = decodeTransferLog(log, "incoming");
    assert.equal(t.from, OTHER);
    assert.equal(t.to, OWNER);
    assert.equal(t.valueRaw, 1_500_000_000_000_000_000n);
    assert.equal(t.blockNumber, 16);
    assert.equal(t.direction, "incoming");
  });

  it("rejects a log that is not a Transfer event", () => {
    assert.throws(() => decodeTransferLog({ transactionHash: "0x1", blockNumber: "0x1", topics: ["0x00"], data: "0x0" }, "incoming"));
  });
});

describe("reading recent transfers", () => {
  it("combines incoming and outgoing logs, newest first", async () => {
    const handler: Handler = (method, params) => {
      if (method === "eth_blockNumber") return "0x64";
      if (method === "eth_getLogs") {
        const f = params[0] as { topics: (string | null)[] };
        const incoming = f.topics[1] === null;
        return [{
          transactionHash: incoming ? "0xin" : "0xout",
          blockNumber: incoming ? "0x50" : "0x60",
          topics: incoming ? [TRANSFER_TOPIC, pad(OTHER), pad(OWNER)] : [TRANSFER_TOPIC, pad(OWNER), pad(OTHER)],
          data: "0x01",
        }];
      }
      return new Error(`unexpected ${method}`);
    };
    const rpc = createRpcClient({ url: "https://rpc.example", fetchImpl: fakeFetch(handler).fetchImpl });
    const out = await readRecentTransfers({ rpc, token: TOKEN, owner: OWNER, lookbackBlocks: 1000 });
    assert.deepEqual(out.map((t) => t.txHash), ["0xout", "0xin"]);
    assert.deepEqual(out.map((t) => t.direction), ["outgoing", "incoming"]);
  });

  it("surfaces an RPC refusal of the block range instead of returning partial data", async () => {
    const handler: Handler = (method) => {
      if (method === "eth_blockNumber") return "0x64";
      if (method === "eth_getLogs") return new Error("block range too large");
      return new Error(`unexpected ${method}`);
    };
    const rpc = createRpcClient({ url: "https://rpc.example", fetchImpl: fakeFetch(handler).fetchImpl });
    await assert.rejects(readRecentTransfers({ rpc, token: TOKEN, owner: OWNER, lookbackBlocks: 1000 }));
  });
});
