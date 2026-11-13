import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertWalletContext,
  describeWalletError,
  INITIAL_WALLET_STATE,
  NO_WALLET_MESSAGE,
  requestAccount,
  requestReviewedWalletTransaction,
  requestWalletTransaction,
  switchToNetwork,
  walletReducer,
  WalletError,
  type Eip1193Provider,
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

describe("assertWalletContext", () => {
  it("confirms the selected account and chain using read-only provider methods", async () => {
    const { p, calls } = provider((method) => method === "eth_accounts" ? [ADDR] : "0x7b7b");
    await assertWalletContext(p, { account: ADDR, chainId: 31611 });
    assert.deepEqual(calls, ["eth_accounts", "eth_chainId"]);
  });

  it("blocks a changed account or chain before a transaction request", async () => {
    const changedAccount = provider((method) => method === "eth_accounts" ? ["0x2222222222222222222222222222222222222222"] : "0x7b7b");
    await assert.rejects(assertWalletContext(changedAccount.p, { account: ADDR, chainId: 31611 }), (e: unknown) => e instanceof WalletError && e.code === "no-account");
    const changedChain = provider((method) => method === "eth_accounts" ? [ADDR] : "0x1");
    await assert.rejects(assertWalletContext(changedChain.p, { account: ADDR, chainId: 31611 }), (e: unknown) => e instanceof WalletError && e.code === "unsupported");
    assert.equal([...changedAccount.calls, ...changedChain.calls].includes("eth_sendTransaction"), false);
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

  it("preserves a bounded diagnostic for unknown errors", () => {
    const d = describeWalletError(new Error("boom"));
    assert.equal(d.code, "unknown");
    assert.match(d.message, /boom/);
    assert.match(d.message, /check your wallet/i);
    assert.ok(d.message.length < 240);
  });

  it("never asks for a seed phrase or private key", () => {
    const messages = [4001, -32002, 4200, 4902, 0].map((c) => describeWalletError(Object.assign(new Error(""), { code: c })).message);
    for (const m of messages) assert.doesNotMatch(m, /seed|private key|secret phrase/i);
  });
});

describe("wallet state machine", () => {
  const connected = { ...INITIAL_WALLET_STATE, status: "connected" as const, address: ADDR, chainId: 31611, walletFound: true };

  it("starts disconnected with discovery not yet run", () => {
    assert.equal(INITIAL_WALLET_STATE.status, "disconnected");
    assert.equal(INITIAL_WALLET_STATE.walletFound, null);
  });

  it("records a discovered wallet and its name", () => {
    const s = walletReducer(INITIAL_WALLET_STATE, { type: "wallet-found", name: "MetaMask" });
    assert.equal(s.walletFound, true);
    assert.equal(s.walletName, "MetaMask");
  });

  it("records when no wallet exists", () => {
    const s = walletReducer(INITIAL_WALLET_STATE, { type: "no-wallet" });
    assert.equal(s.walletFound, false);
    assert.equal(s.status, "disconnected");
  });

  it("moves through connecting to connected", () => {
    const connecting = walletReducer(INITIAL_WALLET_STATE, { type: "connect-start" });
    assert.equal(connecting.status, "connecting");
    const done = walletReducer(connecting, { type: "connect-success", address: ADDR, chainId: 31611 });
    assert.equal(done.status, "connected");
    assert.equal(done.address, ADDR);
    assert.equal(done.chainId, 31611);
  });

  it("keeps the failure message on connect error and clears the address", () => {
    const s = walletReducer(connected, { type: "connect-error", message: "rejected" });
    assert.equal(s.status, "error");
    assert.equal(s.address, null);
    assert.equal(s.error, "rejected");
  });

  it("shows the no-wallet guidance as an error message", () => {
    const s = walletReducer(walletReducer(INITIAL_WALLET_STATE, { type: "no-wallet" }), { type: "connect-error", message: NO_WALLET_MESSAGE });
    assert.equal(s.error, NO_WALLET_MESSAGE);
    assert.equal(s.walletFound, false);
  });

  it("updates the chain while connected and ignores it otherwise", () => {
    assert.equal(walletReducer(connected, { type: "chain-changed", chainId: 31612 }).chainId, 31612);
    assert.equal(walletReducer(INITIAL_WALLET_STATE, { type: "chain-changed", chainId: 31612 }).chainId, null);
  });

  it("follows an account change while connected", () => {
    const next = "0x2222222222222222222222222222222222222222" as const;
    assert.equal(walletReducer(connected, { type: "accounts-changed", address: next }).address, next);
  });

  it("disconnects when the wallet reports no accounts, keeping discovery results", () => {
    const s = walletReducer(connected, { type: "accounts-changed", address: null });
    assert.equal(s.status, "disconnected");
    assert.equal(s.address, null);
    assert.equal(s.walletFound, true);
  });

  it("handles a provider-side disconnect with a clear message", () => {
    const s = walletReducer(connected, { type: "provider-disconnected" });
    assert.equal(s.status, "disconnected");
    assert.equal(s.error, "Your wallet disconnected.");
  });

  it("ignores a provider disconnect when nothing is connected", () => {
    assert.deepEqual(walletReducer(INITIAL_WALLET_STATE, { type: "provider-disconnected" }), INITIAL_WALLET_STATE);
  });

  it("clears the connection on disconnect and keeps discovery results", () => {
    const s = walletReducer(connected, { type: "disconnect" });
    assert.equal(s.status, "disconnected");
    assert.equal(s.address, null);
    assert.equal(s.walletFound, true);
  });
});


describe("requestWalletTransaction", () => {
  it("hands the exact reviewed transaction to the injected provider after account and chain checks", async () => {
    const hash = `0x${"a".repeat(64)}`;
    let sent: unknown;
    const { p, calls } = provider((method, params) => {
      if (method === "eth_accounts") return [ADDR];
      if (method === "eth_chainId") return "0x7b7b";
      if (method === "eth_sendTransaction") {
        sent = params;
        return hash;
      }
      throw new Error(`unexpected ${method}`);
    });
    const tx = { from: ADDR, to: "0x2222222222222222222222222222222222222222", value: "0x100", data: "0x1234" };

    assert.equal(await requestWalletTransaction(p, tx, { account: ADDR, chainId: 31_611 }, 31_611), hash);
    assert.deepEqual(calls, ["eth_accounts", "eth_chainId", "eth_sendTransaction"]);
    assert.deepEqual(sent, [tx]);
  });

  it("never invokes eth_sendTransaction when account or configured-chain checks fail", async () => {
    const changedAccount = provider((method) => method === "eth_accounts" ? ["0x2222222222222222222222222222222222222222"] : "0x7b7b");
    const tx = { from: ADDR, to: "0x2222222222222222222222222222222222222222", value: "0x100" };
    await assert.rejects(requestWalletTransaction(changedAccount.p, tx, { account: ADDR, chainId: 31_611 }, 31_611));
    assert.equal(changedAccount.calls.includes("eth_sendTransaction"), false);

    const correctAccount = provider((method) => method === "eth_accounts" ? [ADDR] : "0x7b7b");
    await assert.rejects(requestWalletTransaction(correctAccount.p, tx, { account: ADDR, chainId: 31_611 }, 1), /selected network/);
    assert.deepEqual(correctAccount.calls, []);
  });
});

describe("requestReviewedWalletTransaction", () => {
  it("invokes eth_sendTransaction synchronously without awaiting provider reads", async () => {
    const hash = `0x${"c".repeat(64)}`;
    let resolveSend: ((value: unknown) => void) | undefined;
    const { p, calls } = provider((method, params) => {
      if (method !== "eth_sendTransaction") throw new Error(`unexpected ${method}`);
      assert.deepEqual(params, [{ from: ADDR, to: "0x2222222222222222222222222222222222222222", value: "0x100", data: "0x1234" }]);
      return new Promise((resolve) => { resolveSend = resolve; });
    });
    let providerCallReported = false;
    const pending = requestReviewedWalletTransaction(
      p,
      { from: ADDR, to: "0x2222222222222222222222222222222222222222", value: "0x100", data: "0x1234" },
      { account: ADDR, chainId: 31_611 },
      31_611,
      () => { providerCallReported = true; },
    );

    assert.deepEqual(calls, ["eth_sendTransaction"]);
    assert.equal(providerCallReported, true);
    resolveSend?.(hash);
    assert.equal(await pending, hash);
  });

  it("blocks a wrong sender or configured chain before invoking the provider", async () => {
    const { p, calls } = provider(() => `0x${"c".repeat(64)}`);
    const tx = { from: ADDR, to: "0x2222222222222222222222222222222222222222" };
    await assert.rejects(requestReviewedWalletTransaction(p, { ...tx, from: "0x2222222222222222222222222222222222222222" }, { account: ADDR, chainId: 31_611 }, 31_611));
    await assert.rejects(requestReviewedWalletTransaction(p, tx, { account: ADDR, chainId: 31_611 }, 1));
    assert.deepEqual(calls, []);
  });
});
