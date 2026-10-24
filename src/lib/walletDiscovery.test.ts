import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildMobileWalletLink, discoverProviders, isMobileUserAgent, selectWallet, type DiscoveredWallet } from "./walletDiscovery";
import type { Eip1193Provider } from "./wallet";

const stub = (): Eip1193Provider => ({ request: async () => null });

function announce(target: EventTarget, detail: unknown) {
  target.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
}

describe("EIP-6963 discovery", () => {
  it("collects wallets that answer the request", async () => {
    const target = new EventTarget();
    target.addEventListener("eip6963:requestProvider", () => {
      announce(target, { info: { uuid: "a", name: "Wallet A" }, provider: stub() });
      announce(target, { info: { uuid: "b", name: "Wallet B" }, provider: stub() });
    });
    const found = await discoverProviders(target, 10);
    assert.deepEqual(found.map((w) => w.name), ["Wallet A", "Wallet B"]);
  });

  it("counts a wallet once even if it announces twice", async () => {
    const target = new EventTarget();
    target.addEventListener("eip6963:requestProvider", () => {
      announce(target, { info: { uuid: "a", name: "Wallet A" }, provider: stub() });
      announce(target, { info: { uuid: "a", name: "Wallet A" }, provider: stub() });
    });
    assert.equal((await discoverProviders(target, 10)).length, 1);
  });

  it("ignores malformed announcements", async () => {
    const target = new EventTarget();
    target.addEventListener("eip6963:requestProvider", () => {
      announce(target, null);
      announce(target, { info: { uuid: "", name: "x" }, provider: stub() });
      announce(target, { info: { uuid: "c", name: "No request fn" }, provider: {} });
    });
    assert.deepEqual(await discoverProviders(target, 10), []);
  });

  it("returns nothing when no wallet announces", async () => {
    assert.deepEqual(await discoverProviders(new EventTarget(), 10), []);
  });
});

describe("wallet selection", () => {
  const discovered: DiscoveredWallet[] = [{ uuid: "a", name: "Wallet A", provider: stub() }];

  it("prefers a discovered wallet over window.ethereum", () => {
    assert.equal(selectWallet(discovered, stub())?.name, "Wallet A");
  });

  it("falls back to window.ethereum", () => {
    assert.equal(selectWallet([], stub())?.name, "Browser wallet");
  });

  it("returns null when no wallet exists, so the app never fakes one", () => {
    assert.equal(selectWallet([], null), null);
  });
});

describe("mobile support", () => {
  it("recognises phones and tablets", () => {
    assert.equal(isMobileUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile Safari/537.36"), true);
    assert.equal(isMobileUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), true);
    assert.equal(isMobileUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120"), false);
  });

  it("builds a wallet deep link that keeps the path and query", () => {
    assert.equal(
      buildMobileWalletLink("https://mezovault-iq.example.deno.net/app/strategies?x=1"),
      "https://metamask.app.link/dapp/mezovault-iq.example.deno.net/app/strategies?x=1",
    );
  });

  it("does not build a link for plain http or invalid URLs", () => {
    assert.equal(buildMobileWalletLink("http://localhost:5173/app"), null);
    assert.equal(buildMobileWalletLink("not a url"), null);
  });
});
