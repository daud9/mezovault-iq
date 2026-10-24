import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkNetwork, parseChainId } from "./network";
import { MEZO_NETWORKS } from "../config/chains";

describe("parseChainId", () => {
  it("parses EIP-695 hex chain ids", () => {
    assert.equal(parseChainId("0x7b7b"), 31611);
    assert.equal(parseChainId("0x7b7c"), 31612);
  });

  it("accepts plain numbers", () => {
    assert.equal(parseChainId(31611), 31611);
  });

  it("rejects malformed or non-positive values", () => {
    assert.equal(parseChainId("7b7b"), null);
    assert.equal(parseChainId("0x"), null);
    assert.equal(parseChainId("0xzz"), null);
    assert.equal(parseChainId(0), null);
    assert.equal(parseChainId(-1), null);
    assert.equal(parseChainId(1.5), null);
    assert.equal(parseChainId(undefined), null);
  });
});

describe("checkNetwork", () => {
  const testnet = MEZO_NETWORKS.testnet;

  it("matches the configured testnet", () => {
    const r = checkNetwork(31611, testnet);
    assert.equal(r.status, "match");
  });

  it("reports mainnet as a known but wrong network", () => {
    const r = checkNetwork(31612, testnet);
    assert.equal(r.status, "mismatch");
    if (r.status === "mismatch") assert.equal(r.actualLabel, "Mezo Mainnet");
  });

  it("reports an unknown chain as a mismatch with no label", () => {
    const r = checkNetwork(1, testnet);
    assert.equal(r.status, "mismatch");
    if (r.status === "mismatch") assert.equal(r.actualLabel, null);
  });

  it("reports an unreadable chain as unknown, never as a match", () => {
    const r = checkNetwork(null, testnet);
    assert.equal(r.status, "unknown-chain");
  });

  it("checks the official testnet parameters", () => {
    assert.equal(testnet.chainId, 31611);
    assert.equal(testnet.chainIdHex, "0x7b7b");
    assert.equal(testnet.rpcUrl, "https://rpc.test.mezo.org");
    assert.equal(testnet.explorerUrl, "https://explorer.test.mezo.org/");
  });
});
