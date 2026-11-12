import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CHAIN_WATCH_NETWORKS, type ChainWatchNetworkConfig } from "../config/chainWatch";
import { encodeBalanceOf } from "./abi";
import { readChainWatchNetwork } from "./chainWatch";
import { fakeFetch, encodeStringResult, encodeUintResult, OWNER, type Handler } from "./testHelpers";

const MEZO = CHAIN_WATCH_NETWORKS.find((network) => network.key === "mezo-mainnet")!;
const BNB = CHAIN_WATCH_NETWORKS.find((network) => network.key === "bnb")!;
const FIXED_NOW = () => new Date("2026-11-12T11:00:00.000Z");

interface Overrides {
  chainId?: string;
  code?: string;
  symbolByToken?: Partial<Record<string, string>>;
  decimalsByToken?: Partial<Record<string, string>>;
  balanceByToken?: Partial<Record<string, string>>;
}

function makeHandler(network: ChainWatchNetworkConfig, overrides: Overrides = {}): Handler {
  const tokensByAddress = Object.values(network.tokens).filter(Boolean);
  return (method, params) => {
    if (method === "eth_chainId") return overrides.chainId ?? `0x${network.chainId.toString(16)}`;
    if (method === "eth_blockNumber") return "0x2a";
    if (method === "eth_getCode") return overrides.code ?? "0x60016000";
    if (method === "eth_call") {
      const call = params[0] as { to: string; data: string };
      const address = call.to.toLowerCase();
      const token = tokensByAddress.find((item) => item?.address.toLowerCase() === address);
      if (!token) return new Error(`Unexpected token address ${call.to}`);
      if (call.data === "0x95d89b41") {
        return overrides.symbolByToken?.[address] ?? encodeStringResult(token.symbol);
      }
      if (call.data === "0x313ce567") {
        return overrides.decimalsByToken?.[address] ?? encodeUintResult(BigInt(token.decimals));
      }
      if (call.data === encodeBalanceOf(OWNER)) {
        return overrides.balanceByToken?.[address] ?? encodeUintResult(1_234_567_890_000_000_000n);
      }
      return new Error(`Unexpected calldata ${call.data}`);
    }
    return new Error(`Unexpected RPC method ${method}`);
  };
}

function run(network: ChainWatchNetworkConfig, overrides: Overrides = {}) {
  const transport = fakeFetch(makeHandler(network, overrides));
  return {
    calls: transport.calls,
    result: readChainWatchNetwork(network, OWNER, { fetchImpl: transport.fetchImpl, now: FIXED_NOW }),
  };
}

describe("Chain Watch read-only balance reader", () => {
  it("shows balances only after the expected chain and token code, symbol, and decimals pass", async () => {
    const { calls, result } = run(MEZO);
    const snapshot = await result;
    assert.equal(snapshot.status, "available");
    assert.equal(snapshot.blockNumber, "42");
    assert.equal(snapshot.retrievedAt, "2026-11-12T11:00:00.000Z");
    assert.equal(snapshot.tokens.MUSD.status, "ok");
    assert.equal(snapshot.tokens.MEZO.status, "ok");
    if (snapshot.tokens.MUSD.status === "ok") {
      assert.equal(snapshot.tokens.MUSD.formatted, "1.234567");
      assert.equal(snapshot.tokens.MUSD.decimals, 18);
    }
    assert.ok(calls.some((call) => call.method === "eth_getCode"));
  });

  it("pins code, metadata, and balance reads to one block and queries the manually supplied address", async () => {
    const { calls, result } = run(MEZO);
    await result;
    const balanceCalls = calls.filter((call) => call.method === "eth_call" && (call.params[0] as { data: string }).data.startsWith("0x70a08231"));
    assert.equal(balanceCalls.length, 2);
    for (const call of balanceCalls) {
      const [request, blockTag] = call.params as [{ data: string }, string];
      assert.equal(request.data, encodeBalanceOf(OWNER));
      assert.equal(blockTag, "0x2a");
    }
  });

  it("labels MUSD on BNB Chain not supported and makes no MUSD contract request", async () => {
    const { calls, result } = run(BNB);
    const snapshot = await result;
    assert.deepEqual(snapshot.tokens.MUSD, { status: "not-supported" });
    assert.equal(snapshot.tokens.MEZO.status, "ok");
    const codeReads = calls.filter((call) => call.method === "eth_getCode");
    assert.deepEqual(codeReads.map((call) => call.params[0]), [BNB.tokens.MEZO!.address]);
  });

  it("withholds a balance when a verified token address has no bytecode", async () => {
    const { result } = run(MEZO, { code: "0x" });
    const snapshot = await result;
    assert.equal(snapshot.tokens.MUSD.status, "unavailable");
    if (snapshot.tokens.MUSD.status === "unavailable") assert.match(snapshot.tokens.MUSD.reason, /bytecode/);
  });

  it("withholds balances when a token's on-chain symbol or decimals differ from the verified value", async () => {
    const musdAddress = MEZO.tokens.MUSD!.address.toLowerCase();
    const wrongSymbol = run(MEZO, { symbolByToken: { [musdAddress]: encodeStringResult("NOT-MUSD") } });
    const symbolSnapshot = await wrongSymbol.result;
    assert.equal(symbolSnapshot.tokens.MUSD.status, "unavailable");

    const wrongDecimals = run(MEZO, { decimalsByToken: { [musdAddress]: encodeUintResult(6n) } });
    const decimalsSnapshot = await wrongDecimals.result;
    assert.equal(decimalsSnapshot.tokens.MUSD.status, "unavailable");
  });

  it("does not query contracts after the RPC reports the wrong network", async () => {
    const { calls, result } = run(MEZO, { chainId: "0x1" });
    const snapshot = await result;
    assert.equal(snapshot.status, "unavailable");
    assert.equal(snapshot.tokens.MUSD.status, "unavailable");
    assert.equal(calls.some((call) => call.method === "eth_getCode" || call.method === "eth_call"), false);
  });

  it("treats a true on-chain zero as a valid zero balance", async () => {
    const musdAddress = MEZO.tokens.MUSD!.address.toLowerCase();
    const { result } = run(MEZO, { balanceByToken: { [musdAddress]: encodeUintResult(0n) } });
    const snapshot = await result;
    assert.equal(snapshot.tokens.MUSD.status, "ok");
    if (snapshot.tokens.MUSD.status === "ok") assert.equal(snapshot.tokens.MUSD.formatted, "0");
  });

  it("rejects an invalid public address before making any RPC request", async () => {
    const transport = fakeFetch(makeHandler(MEZO));
    await assert.rejects(
      readChainWatchNetwork(MEZO, "not-an-address", { fetchImpl: transport.fetchImpl }),
      /valid 0x-prefixed/,
    );
    assert.equal(transport.calls.length, 0);
  });
});
