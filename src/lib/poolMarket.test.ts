import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRpcClient } from "./rpc";
import { MEZO_NETWORKS } from "../config/chains";
import { TESTNET_BASIC_POOLS } from "../config/pools";
import { readPoolMarket, POOL_SELECTORS } from "./pool";
import { fakeFetch, encodeUintResult, type Handler } from "./testHelpers";

const network = MEZO_NETWORKS.testnet;
const pool = TESTNET_BASIC_POOLS[0];
const musd = network.musd!.address;
const other = "0x7b7C000000000000000000000000000000000099";
const addressWord = (address: string) => `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
const reserves = (r0: bigint, r1: bigint) => `0x${r0.toString(16).padStart(64, "0")}${r1.toString(16).padStart(64, "0")}${"0".repeat(64)}`;

function makeHandler(options: { chainId?: string; code?: string; r0?: bigint; r1?: bigint; dec0?: bigint; dec1?: bigint } = {}): Handler {
  return (method, params) => {
    if (method === "eth_chainId") return options.chainId ?? "0x7b7b";
    if (method === "eth_blockNumber") return "0x20";
    if (method === "eth_getCode") {
      assert.deepEqual(params, [pool.address, "0x20"]);
      return options.code ?? "0x6000";
    }
    if (method === "eth_call") {
      const [call, blockTag] = params as [{ to: string; data: string }, string];
      assert.equal(blockTag, "0x20");
      if (call.data === POOL_SELECTORS.token0) return addressWord(musd);
      if (call.data === POOL_SELECTORS.token1) return addressWord(other);
      if (call.data === POOL_SELECTORS.getReserves) return reserves(options.r0 ?? 500n * 10n ** 18n, options.r1 ?? 2n * 10n ** 18n);
      if (call.data === POOL_SELECTORS.decimals) return encodeUintResult(call.to.toLowerCase() === musd.toLowerCase() ? options.dec0 ?? 18n : options.dec1 ?? 18n);
    }
    return new Error(`unexpected ${method}`);
  };
}

function read(handler: Handler) {
  const rpc = createRpcClient({ url: network.rpcUrl, fetchImpl: fakeFetch(handler).fetchImpl });
  return readPoolMarket({ network, pool, rpc, now: () => new Date("2026-11-12T11:00:00.000Z") });
}

describe("readPoolMarket", () => {
  it("reads reserves and computes a normalized spot price at one block", async () => {
    const result = await read(makeHandler());
    assert.equal(result.status, "ok");
    if (result.status !== "ok") return;
    assert.deepEqual(result.tokens.map((token) => [token.symbol, token.reserveFormatted]), [["MUSD", "500"], ["Other asset", "2"]]);
    assert.equal(result.spotPrice, "0.004");
    assert.equal(result.blockNumber, 32);
    assert.equal(result.retrievedAt, "2026-11-12T11:00:00.000Z");
    assert.equal(result.feeTier, null);
    assert.equal(result.liquidityUsd, null);
  });

  it("normalizes differing token decimals before computing spot price", async () => {
    const result = await read(makeHandler({ r0: 10_000_000n, r1: 2n * 10n ** 18n, dec0: 6n, dec1: 18n }));
    assert.equal(result.status, "ok");
    if (result.status === "ok") assert.equal(result.spotPrice, "0.2");
  });

  it("returns no spot price when the base reserve is zero", async () => {
    const result = await read(makeHandler({ r0: 0n }));
    assert.equal(result.status, "ok");
    if (result.status === "ok") assert.equal(result.spotPrice, null);
  });

  it("does not claim deployment on a different chain or at an empty address", async () => {
    assert.equal((await read(makeHandler({ chainId: "0x7b7c" }))).status, "wrong-network");
    assert.equal((await read(makeHandler({ code: "0x" }))).status, "no-contract");
  });
});
