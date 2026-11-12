import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MEZO_NETWORKS } from "../config/chains";
import { MEZO_TESTNET_SELECTORS as S } from "./mezoAbi";
import { createRpcClient } from "./rpc";
import { encodeUintResult, fakeFetch, type Handler } from "./testHelpers";
import {
  btcUsdPriceAgeSeconds,
  estimateBtcBalanceUsd,
  isBtcUsdPriceFresh,
  readBtcUsdPrice,
} from "./portfolioPrice";
import type { VerifiedBtcUsdPrice } from "./portfolioPrice";

const NETWORK = MEZO_NETWORKS.testnet;
const WAD = 10n ** 18n;
const NOW_SECONDS = Math.floor(Date.parse("2026-11-12T08:00:00.000Z") / 1_000);
const BLOCK_TAG = "0x64";
const ORACLE = "0x7b7c000000000000000000000000000000000015";

function word(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function addressResult(address: string): string {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function roundData(answer: bigint, updatedAt: number): string {
  return `0x${word(1n)}${word(answer)}${word(BigInt(updatedAt))}${word(BigInt(updatedAt))}${word(1n)}`;
}

function handler(options: { chainId?: string; ageSeconds?: number; priceUsdWad?: bigint } = {}): Handler {
  return (method, params) => {
    if (method === "eth_chainId") return options.chainId ?? "0x7b7b";
    if (method === "eth_blockNumber") return BLOCK_TAG;
    if (method === "eth_getBlockByNumber") {
      assert.equal(params[0], BLOCK_TAG);
      return { number: BLOCK_TAG, timestamp: `0x${NOW_SECONDS.toString(16)}` };
    }
    if (method === "eth_getCode") return "0x60006000";
    if (method === "eth_call") {
      const call = params[0] as { to: string; data: string };
      const to = call.to.toLowerCase();
      const data = call.data.toLowerCase();
      assert.equal(params[1], BLOCK_TAG);
      if (to === NETWORK.priceFeed!.address.toLowerCase()) {
        if (data === S.priceFeed.fetchPrice) return encodeUintResult(options.priceUsdWad ?? 80_000n * WAD);
        if (data === S.priceFeed.oracle) return addressResult(ORACLE);
      }
      if (to === ORACLE.toLowerCase()) {
        if (data === S.priceOracleCaller.decimals) return encodeUintResult(8n);
        if (data === S.priceOracleCaller.latestRoundData) {
          const age = options.ageSeconds ?? 60;
          return roundData(8_000_000_000_000n, NOW_SECONDS - age);
        }
      }
      return new Error(`unexpected eth_call ${to} ${data}`);
    }
    return new Error(`unexpected RPC method ${method}`);
  };
}

function run(mock: Parameters<typeof handler>[0] = {}, network = NETWORK) {
  const fake = fakeFetch(handler(mock));
  const rpc = createRpcClient({ url: network.rpcUrl, fetchImpl: fake.fetchImpl });
  return { result: readBtcUsdPrice({ network, rpc }), calls: fake.calls };
}

describe("Mezo BTC/USD portfolio price", () => {
  it("reads a positive price and freshness metadata at one verified Testnet block", async () => {
    const { result, calls } = run();
    const read = await result;
    assert.equal(read.status, "ok");
    if (read.status === "ok") {
      assert.equal(read.priceUsdWad, 80_000n * WAD);
      assert.equal(read.blockNumber, 100);
      assert.equal(read.observedAtMs, NOW_SECONDS * 1_000);
      assert.equal(read.updatedAt, NOW_SECONDS - 60);
      assert.equal(read.priceAgeSeconds, 60);
    }
    const chainCalls = calls.filter((call) => call.method === "eth_call");
    assert.equal(chainCalls.length, 4);
    assert.ok(chainCalls.every((call) => call.params[1] === BLOCK_TAG));
    assert.ok(calls.filter((call) => call.method === "eth_getCode").every((call) => call.params[1] === BLOCK_TAG));
  });

  it("does not return a stale price", async () => {
    const { result } = run({ ageSeconds: 3_601 });
    assert.deepEqual(await result, {
      status: "error",
      kind: "stale-data",
      message: "The Mezo BTC/USD oracle update is stale or newer than the snapshot block.",
    });
  });

  it("refuses contract reads when the RPC reports another chain", async () => {
    const { result, calls } = run({ chainId: "0x7b7c" });
    assert.deepEqual(await result, { status: "wrong-network", actualChainId: 31612, expectedChainId: 31611 });
    assert.equal(calls.some((call) => call.method === "eth_call" || call.method === "eth_getCode"), false);
  });

  it("does not make up a price on a network without a configured oracle", async () => {
    const { result, calls } = run({}, MEZO_NETWORKS.mainnet);
    const read = await result;
    assert.equal(read.status, "not-configured");
    assert.equal(calls.length, 0);
  });

  it("calculates only BTC balance value with BigInt precision", () => {
    assert.equal(estimateBtcBalanceUsd(WAD, 80_000n * WAD), "80,000");
    assert.equal(estimateBtcBalanceUsd(WAD / 100n, 80_000n * WAD), "800");
    assert.throws(() => estimateBtcBalanceUsd(WAD, 0n), /positive verified/);
  });

  it("ages a displayed quote and expires it once it passes the one-hour limit", () => {
    const price: VerifiedBtcUsdPrice = {
      status: "ok",
      priceUsdWad: 80_000n * WAD,
      blockNumber: 100,
      observedAtMs: 1_000_000,
      updatedAt: 999,
      priceAgeSeconds: 60,
    };
    assert.equal(btcUsdPriceAgeSeconds(price, price.observedAtMs + 3_539_000), 3_599);
    assert.equal(isBtcUsdPriceFresh(price, price.observedAtMs + 3_540_000), true);
    assert.equal(btcUsdPriceAgeSeconds(price, price.observedAtMs + 3_541_000), 3_601);
    assert.equal(isBtcUsdPriceFresh(price, price.observedAtMs + 3_541_000), false);
  });
});
