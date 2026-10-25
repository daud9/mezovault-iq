import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readPoolPosition, POOL_SELECTORS } from "./pool";
import { createRpcClient } from "./rpc";
import { MEZO_NETWORKS } from "../config/chains";
import { TESTNET_BASIC_POOLS } from "../config/pools";
import { fakeFetch, encodeUintResult, OWNER, type Handler } from "./testHelpers";

const T = MEZO_NETWORKS.testnet;
const POOL = TESTNET_BASIC_POOLS[0];
const MUSD = T.musd!.address;
const BTC = "0x7b7C000000000000000000000000000000000000";
const now = () => new Date("2026-10-25T10:00:00.000Z");

const addrWord = (a: string) => a.slice(2).toLowerCase().padStart(64, "0");
const reserves = (r0: bigint, r1: bigint) => `0x${r0.toString(16).padStart(64, "0")}${r1.toString(16).padStart(64, "0")}${"0".repeat(64)}`;

function handler(o: Partial<{ token0: string; token1: string; total: bigint; lp: bigint; r0: bigint; r1: bigint; code: string; chainId: string; dec0: bigint; dec1: bigint; revertLp: boolean }> = {}): Handler {
  return (method, params) => {
    if (method === "eth_chainId") return o.chainId ?? "0x7b7b";
    if (method === "eth_getCode") return o.code ?? "0x6080";
    if (method === "eth_blockNumber") return "0x5";
    if (method === "eth_call") {
      const { to, data } = params[0] as { to: string; data: string };
      if (data === POOL_SELECTORS.token0) return `0x${addrWord(o.token0 ?? MUSD)}`;
      if (data === POOL_SELECTORS.token1) return `0x${addrWord(o.token1 ?? BTC)}`;
      if (data === POOL_SELECTORS.totalSupply) return encodeUintResult(o.total ?? 1_000n * 10n ** 18n);
      if (data.startsWith(POOL_SELECTORS.balanceOf)) {
        if (o.revertLp) return new Error("execution reverted");
        return encodeUintResult(o.lp ?? 0n);
      }
      if (data === POOL_SELECTORS.getReserves) return reserves(o.r0 ?? 500n * 10n ** 18n, o.r1 ?? 2n * 10n ** 18n);
      if (data === POOL_SELECTORS.decimals) return encodeUintResult(to.toLowerCase() === MUSD.toLowerCase() ? (o.dec0 ?? 18n) : (o.dec1 ?? 18n));
    }
    return new Error(`unexpected ${method}`);
  };
}

function run(h: Handler, pool = POOL, network = T) {
  const rpc = createRpcClient({ url: network.rpcUrl, fetchImpl: fakeFetch(h).fetchImpl });
  return readPoolPosition({ network, pool, owner: OWNER, rpc, now });
}

describe("pool position", () => {
  it("reports no position when the wallet holds no pool tokens", async () => {
    const r = await run(handler({ lp: 0n }));
    assert.equal(r.status, "ok");
    if (r.status === "ok") {
      assert.equal(r.hasPosition, false);
      assert.equal(r.sharePct, 0);
    }
  });

  it("works out the wallet's share of each token from its LP balance", async () => {
    // Holds 10% of the pool: 10% of 500 MUSD = 50 MUSD and 10% of 2 BTC = 0.2 BTC.
    const r = await run(handler({ lp: 100n * 10n ** 18n, total: 1_000n * 10n ** 18n, r0: 500n * 10n ** 18n, r1: 2n * 10n ** 18n }));
    assert.equal(r.status, "ok");
    if (r.status === "ok") {
      assert.equal(r.hasPosition, true);
      assert.equal(r.sharePct, 10);
      assert.equal(r.tokens[0].userFormatted, "50");
      assert.equal(r.tokens[1].userFormatted, "0.2");
    }
  });

  it("uses each token's on-chain decimals, not a shared assumption", async () => {
    const r = await run(handler({ dec1: 6n, lp: 500n * 10n ** 18n, total: 1_000n * 10n ** 18n, r0: 100n * 10n ** 18n, r1: 200_000_000n }));
    assert.equal(r.status, "ok");
    if (r.status === "ok") assert.equal(r.tokens[1].decimals, 6);
  });

  it("refuses a pool that does not contain MUSD", async () => {
    const r = await run(handler({ token0: "0x1111111111111111111111111111111111111111", token1: BTC }));
    assert.equal(r.status, "error");
    if (r.status === "error") assert.equal(r.kind, "pair-mismatch");
  });

  it("reports no-contract when nothing is deployed at the pool address", async () => {
    assert.equal((await run(handler({ code: "0x" }))).status, "no-contract");
  });

  it("refuses to read on another network", async () => {
    assert.equal((await run(handler({ chainId: "0x7b7c" }))).status, "wrong-network");
  });

  it("returns an error, not a zero position, when the balance call reverts", async () => {
    const r = await run(handler({ revertLp: true }));
    assert.equal(r.status, "error");
  });
});

describe("pool selectors", () => {
  it("match the standard token-pair interface", () => {
    assert.equal(POOL_SELECTORS.token0, "0x0dfe1681");
    assert.equal(POOL_SELECTORS.token1, "0xd21220a7");
    assert.equal(POOL_SELECTORS.totalSupply, "0x18160ddd");
    assert.equal(POOL_SELECTORS.getReserves, "0x0902f1ac");
  });
});

describe("testnet pool list", () => {
  it("contains exactly the official testnet basic pools", () => {
    assert.deepEqual(
      TESTNET_BASIC_POOLS.map((p) => p.address),
      ["0xd16A5Df82120ED8D626a1a15232bFcE2366d6AA9", "0x525F049A4494dA0a6c87E3C4df55f9929765Dc3e", "0x27414B76CF00E24ed087adb56E26bAeEEe93494e"],
    );
  });
});
