import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toEventSelector, toFunctionSelector } from "viem";
import { MEZO_NETWORKS } from "../config/chains";
import { createRpcClient } from "./rpc";
import { encodeAddressWord } from "./abi";
import { fakeFetch, encodeUintResult, OWNER } from "./testHelpers";
import { readClosedTroveHistory } from "./closedTroveHistory";

const NETWORK = MEZO_NETWORKS.testnet;
const MANAGER = NETWORK.troveManager!.address;
const SURPLUS = "0x2222222222222222222222222222222222222222";
const BLOCK_NUMBER = 10_000;
const BLOCK_TAG = "0x2710";
const TROVE_UPDATED_TOPIC = toEventSelector("TroveUpdated(address,uint256,uint256,uint256,uint256,uint16,uint256,uint8)");
const COLL_SURPLUS_POOL_SELECTOR = toFunctionSelector("collSurplusPool()");
const GET_COLLATERAL_SELECTOR = toFunctionSelector("getCollateral(address)");

function word(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}
function addr(address: string): string {
  return encodeAddressWord(address);
}
function addressResult(address: string): string {
  return `0x${addr(address)}`;
}
function closureLog(options: { owner?: string; manager?: string; operation?: bigint; principal?: bigint; interest?: bigint; collateral?: bigint; block?: number } = {}) {
  const owner = options.owner ?? OWNER;
  const values = [options.principal ?? 0n, options.interest ?? 0n, options.collateral ?? 0n, 0n, 0n, 0n, options.operation ?? 2n];
  return {
    address: options.manager ?? MANAGER,
    topics: [TROVE_UPDATED_TOPIC, `0x${addr(owner)}`],
    data: `0x${values.map(word).join("")}`,
    blockNumber: `0x${(options.block ?? 9_900).toString(16)}`,
    transactionHash: `0x${"b".repeat(64)}`,
    transactionIndex: "0x1",
    logIndex: "0xc",
  };
}

function client(options: { logs?: unknown[]; surplus?: bigint; failLogs?: boolean; failSurplus?: boolean } = {}) {
  const mock = fakeFetch((method, params) => {
    if (method === "eth_getLogs") {
      const filter = params[0] as { address: string; fromBlock: string; toBlock: string; topics: string[] };
      assert.equal(filter.address.toLowerCase(), MANAGER.toLowerCase());
      assert.equal(filter.fromBlock, "0x1");
      assert.equal(filter.toBlock, BLOCK_TAG);
      assert.equal(filter.topics[0], TROVE_UPDATED_TOPIC);
      assert.equal(filter.topics[1], `0x${addr(OWNER)}`);
      return options.failLogs ? new Error("log read unavailable") : options.logs ?? [];
    }
    if (method === "eth_getCode") return "0x60006000";
    if (method === "eth_call") {
      const tx = params[0] as { to: string; data: string };
      assert.equal(params[1], BLOCK_TAG, "surplus calls use the Trove snapshot block");
      if (tx.to.toLowerCase() === MANAGER.toLowerCase() && tx.data === COLL_SURPLUS_POOL_SELECTOR) {
        if (options.failSurplus) return new Error("surplus pointer unavailable");
        return addressResult(SURPLUS);
      }
      if (tx.to.toLowerCase() === SURPLUS.toLowerCase() && tx.data.startsWith(GET_COLLATERAL_SELECTOR)) {
        if (options.failSurplus) return new Error("surplus read unavailable");
        return encodeUintResult(options.surplus ?? 0n);
      }
      return new Error(`unexpected eth_call ${tx.to} ${tx.data}`);
    }
    return new Error(`unexpected history RPC method ${method}`);
  });
  return { rpc: createRpcClient({ url: NETWORK.rpcUrl, fetchImpl: mock.fetchImpl }), calls: mock.calls };
}

describe("closed-by-redemption history", () => {
  it("returns the exact event transaction/block and pinned claimable collateral", async () => {
    const event = closureLog();
    const amount = 14_859_007_665_964_744n;
    const { rpc, calls } = client({ logs: [event], surplus: amount });
    const history = await readClosedTroveHistory({ network: NETWORK, owner: OWNER, blockNumber: BLOCK_NUMBER, blockTag: BLOCK_TAG, rpc });
    assert.deepEqual(history, {
      closure: { transactionHash: event.transactionHash, blockNumber: 9_900 },
      closureUnavailableReason: null,
      claimableSurplusRaw: amount,
      claimableSurplusBtc: "0.014859007665964744",
      surplusUnavailableReason: null,
      snapshotBlock: BLOCK_NUMBER,
    });
    assert.equal(calls.some((call) => call.method === "eth_sendTransaction"), false);
  });

  it("ignores partial redemptions, other accounts, and non-redemption updates", async () => {
    const { rpc } = client({ logs: [
      closureLog({ principal: 1n }),
      closureLog({ owner: "0x3333333333333333333333333333333333333333" }),
      closureLog({ operation: 1n }),
    ] });
    const history = await readClosedTroveHistory({ network: NETWORK, owner: OWNER, blockNumber: BLOCK_NUMBER, blockTag: BLOCK_TAG, rpc });
    assert.equal(history.closure, null);
    assert.match(history.closureUnavailableReason ?? "", /not found/i);
  });

  it("keeps status-4 history explicit when logs or surplus are unavailable", async () => {
    const { rpc } = client({ failLogs: true, failSurplus: true });
    const history = await readClosedTroveHistory({ network: NETWORK, owner: OWNER, blockNumber: BLOCK_NUMBER, blockTag: BLOCK_TAG, rpc });
    assert.equal(history.closure, null);
    assert.equal(history.claimableSurplusRaw, null);
    assert.match(history.closureUnavailableReason ?? "", /RPC endpoint could not be reached/);
    assert.match(history.surplusUnavailableReason ?? "", /RPC endpoint could not be reached/);
  });
});
