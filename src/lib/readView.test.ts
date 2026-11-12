import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectReadView } from "./readView";

describe("wallet-context read view", () => {
  it("hides a completed previous-account result immediately", () => {
    const result = selectReadView({
      stored: { key: "testnet:0xold:0", view: { status: "done", balance: "old account" } },
      currentKey: "testnet:0xnew:0",
      enabled: true,
      loading: { status: "loading" },
      idle: { status: "idle" },
    });
    assert.deepEqual(result, { status: "loading" });
  });

  it("keeps a matching result and returns idle when reads are disabled", () => {
    const stored = { key: "testnet:0xme:0", view: { status: "done", balance: "current" } };
    assert.deepEqual(selectReadView({ stored, currentKey: stored.key, enabled: true, loading: { status: "loading" }, idle: { status: "idle" } }), stored.view);
    assert.deepEqual(selectReadView({ stored, currentKey: "mainnet:0xme:0", enabled: false, loading: { status: "loading" }, idle: { status: "idle" } }), { status: "idle" });
  });
});
