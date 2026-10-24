import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  describeWalletError,
  INITIAL_WALLET_STATE,
  requestAccount,
  switchToNetwork,
  walletReducer,
  WalletError,
  type Eip1193Provider,
  type WalletState,
} from "./wallet";
import { MEZO_NETWORKS } from "../config/chains";

const ADDR = "0x1111111111111111111111111111111111111111" as const;

function provider(handler: (method: string, params?: unknown) => unknown): { p: Eip1193Provider; calls: string[] } {
  const calls: string[] = [];
  const p: Eip1193Provider = {
    request: async ({ method, params }) => {
      calls.push(method);
      return handler(method, params);
    },
  };
  return { p, calls };
}

describe("requestAccount", () => {
  it("returns the first valid address", async () => {
    const { p } = provider(() => [ADDR]);
    assert.equal(await requestAccount(p), ADDR);
  });

  it("fails when the wallet returns no accounts", async () => {
    const { p } = provider(() => []);
    await assert.rejects(requestAccount(p), (e: unknown) => e instanceof WalletError && e.code === "no-account");
  });

  it("fails when the wallet returns a non-address", async () => {
    const { p } = provider(() => ["not-an-address"]);
    await assert.rejects(requestAccount(p), (e: unknown) => e instanceof WalletError);
  });
});

describe("switchToNetwork", () => {
  const net = MEZO_NETWORKS.testnet;

  it("switches directly when the wallet knows the network", async () => {
    const { p, calls } = provider(() => null);
    await switchToNetwork(p, net);
    assert.deepEqual(calls, ["wallet_switchEthereumChain"]);
  });

  it("adds the official network when the wallet does not know it (4902), then switches", async () => {
    let switched = 0;
    const { p, calls } = provider((method) => {
      if (method === "wallet_switchEthereumChain") {
        switched++;
        if (switched === 1) throw Object.assign(new Error("unknown chain"), { code: 4902 });
        return null;
      }
      return null;
    });
    await switchToNetwork(p, net);
    assert.deepEqual(calls, ["wallet_switchEthereumChain", "wallet_addEthereumChain", "wallet_switchEthereumChain"]);
  });

  it("sends the official testnet parameters when adding the network", async () => {
    let added: unknown = null;
    const { p } = provider((method, params) => {
      if (method === "wallet_switchEthereumChain" && !added) throw Object.assign(new Error("x"), { code: 4902 });
      if (method === "wallet_addEthereumChain") added = params;
      return null;
    });
    await switchToNetwork(p, net);
    const [entry] = added as [Record<string, unknown>];
    assert.equal(entry.chainId, "0x7b7b");
    assert.equal(entry.rpcUrls && (entry.rpcUrls as string[])[0], "https://rpc.test.mezo.org");
    assert.equal((entry.nativeCurrency as { symbol: string }).symbol, "BTC");
  });

  it("rethrows other errors without adding a network", async () => {
    const { p, calls } = provider(() => {
      throw Object.assign(new Error("rejected"), { code: 4001 });
    });
    await assert.rejects(switchToNetwork(p, net));
    assert.deepEqual(calls, ["wallet_switchEthereumChain"]);
  });
});

describe("describeWalletError", () => {
  it("explains a rejected request", () => {
    assert.equal(describeWalletError(Object.assign(new Error("x"), { code: 4001 })).code, "rejected");
  });

  it("explains a pending request", () => {
    assert.equal(describeWalletError(Object.assign(new Error("x"), { code: -32002 })).code, "pending");
  });

  it("falls back to a generic message for unknown errors", () => {
    const d = describeWalletError(new Error("boom"));
    assert.equal(d.code, "unknown");
    assert.match(d.message, /try again/i);
  });

  it("never asks for a seed phrase or private key", () => {
    const messages = [4001, -32002, 4200, 4902, 0].map((c) => describeWalletError(Object.assign(new Error(""), { code: c })).message);
    for (const m of messages) assert.doesNotMatch(m, /seed|private key|secret phrase/i);
  });
});

describe("wallet state machine", () => {
  const connected: WalletState = { status: "connected", address: ADDR, chainId: 31611, error: null };

  it("starts disconnected", () => {
    assert.equal(INITIAL_WALLET_STATE.status, "disconnected");
  });

  it("reports no-wallet when no provider is injected", () => {
    const s = walletReducer(INITIAL_WALLET_STATE, { type: "provider-detected", present: false });
    assert.equal(s.status, "no-wallet");
  });

  it("moves through connecting to connected", () => {
    const connecting = walletReducer(INITIAL_WALLET_STATE, { type: "connect-start" });
    assert.equal(connecting.status, "connecting");
    const done = walletReducer(connecting, { type: "connect-success", address: ADDR, chainId: 31611 });
    assert.deepEqual(done, connected);
  });

  it("keeps the failure message on connect error and clears the address", () => {
    const s = walletReducer(connected, { type: "connect-error", message: "rejected" });
    assert.equal(s.status, "error");
    assert.equal(s.address, null);
    assert.equal(s.error, "rejected");
  });

  it("updates the chain while connected", () => {
    const s = walletReducer(connected, { type: "chain-changed", chainId: 31612 });
    assert.equal(s.chainId, 31612);
  });

  it("ignores chain changes while disconnected", () => {
    const s = walletReducer(INITIAL_WALLET_STATE, { type: "chain-changed", chainId: 31612 });
    assert.equal(s.chainId, null);
  });

  it("disconnects when the wallet reports no accounts", () => {
    const s = walletReducer(connected, { type: "accounts-changed", address: null });
    assert.equal(s.status, "disconnected");
    assert.equal(s.address, null);
  });

  it("follows an account change while connected", () => {
    const next = "0x2222222222222222222222222222222222222222" as const;
    assert.equal(walletReducer(connected, { type: "accounts-changed", address: next }).address, next);
  });

  it("clears everything on disconnect", () => {
    assert.deepEqual(walletReducer(connected, { type: "disconnect" }), INITIAL_WALLET_STATE);
  });
});
