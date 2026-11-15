import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FacilitatorClient } from "@x402/core/server";
import { buildLinkAuthorizationMessage, X402_TESTNET_NETWORK } from "../src/lib/x402PayLinks.ts";
import { createMerchantApp, FixedWindowLimiter } from "./app.ts";

const SECRET = "test-only-hmac-key-do-not-use-in-production-0001";
const RECIPIENT = "0x1111111111111111111111111111111111111111" as const;
const BUYER = "0x2222222222222222222222222222222222222222";
const TESTNET_MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";
const TEST_SIGNATURE = `0x${"ab".repeat(65)}` as `0x${string}`;
const FAKE_TX = `0x${"cd".repeat(32)}`;

describe("bounded pay-link rate limiter", () => {
  it("keeps each window duration correct and caps attacker-controlled key growth", () => {
    const limiter = new FixedWindowLimiter();
    assert.equal(limiter.consume("recipient", 1, 60 * 60_000, 1_000), true);
    assert.equal(limiter.consume("recipient", 1, 60 * 60_000, 1_001), false);
    for (let index = 0; index < 4_999; index += 1) {
      limiter.consume(`short:${index}`, 1, 60_000, 1_000);
    }

    const state = (limiter as unknown as { windows: Map<string, unknown> }).windows;
    assert.equal(state.size, 5_000);
    limiter.consume("short:after-expiry", 1, 60_000, 61_000);
    assert.equal(state.has("recipient"), true, "a one-hour recipient limit must not expire with one-minute IP limits");
    assert.equal(state.size, 2);

    const full = new FixedWindowLimiter();
    for (let index = 0; index < 5_000; index += 1) {
      full.consume(`active:${index}`, 1, 60 * 60_000, 1_000);
    }
    const fullState = (full as unknown as { windows: Map<string, unknown> }).windows;
    assert.equal(fullState.size, 5_000);
    full.consume("active:overflow", 1, 60 * 60_000, 1_001);
    assert.equal(fullState.size, 5_000);
  });
});

class MockFacilitator implements FacilitatorClient {
  verifies: Array<Parameters<FacilitatorClient["verify"]>[1]> = [];
  settles: Array<Parameters<FacilitatorClient["settle"]>[1]> = [];
  settlementSucceeds = true;
  settlementNetwork: `${string}:${string}` = X402_TESTNET_NETWORK;
  settlementAmount: string | null = null;
  settlementTransaction = FAKE_TX;

  async getSupported(): ReturnType<FacilitatorClient["getSupported"]> {
    return {
      kinds: [{ x402Version: 2, scheme: "exact", network: X402_TESTNET_NETWORK }],
      extensions: [],
      signers: { [X402_TESTNET_NETWORK]: ["0x3333333333333333333333333333333333333333"] },
    };
  }

  async verify(_payload: Parameters<FacilitatorClient["verify"]>[0], requirements: Parameters<FacilitatorClient["verify"]>[1]): ReturnType<FacilitatorClient["verify"]> {
    this.verifies.push(requirements);
    return { isValid: true, payer: BUYER };
  }

  async settle(_payload: Parameters<FacilitatorClient["settle"]>[0], requirements: Parameters<FacilitatorClient["settle"]>[1]): ReturnType<FacilitatorClient["settle"]> {
    this.settles.push(requirements);
    return {
      success: this.settlementSucceeds,
      transaction: this.settlementSucceeds ? this.settlementTransaction : "",
      network: this.settlementNetwork,
      payer: BUYER,
      ...(this.settlementSucceeds ? { amount: this.settlementAmount ?? requirements.amount } : { errorReason: "mock_settlement_failure", errorMessage: "Mock failure" }),
    };
  }
}

async function startApp(app: ReturnType<typeof createMerchantApp>): Promise<{ baseUrl: string; server: Server; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    server,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function createLink(baseUrl: string, now = Date.now()): Promise<{ url: string; resourceUrl: string; path: string; token: string }> {
  const nonce = "a".repeat(32);
  const message = buildLinkAuthorizationMessage({ recipient: RECIPIENT, amount: "3.25", issuedAt: now, nonce });
  const response = await fetch(`${baseUrl}/api/pay-links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: RECIPIENT, amount: "3.25", issuedAt: now, nonce, signature: TEST_SIGNATURE }),
  });
  const responseText = await response.text();
  assert.equal(response.status, 201, responseText);
  const body = JSON.parse(responseText) as { path: string; recipient: string; amount: string; network: string };
  assert.equal(body.recipient, RECIPIENT);
  assert.equal(body.amount, "3.25");
  assert.equal(body.network, X402_TESTNET_NETWORK);
  assert.equal(message.includes("does not transfer MUSD"), true);
  assert.match(body.path, /^\/pay#link=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const checkout = new URL(body.path, baseUrl);
  assert.equal(checkout.search, "", "the bearer link must not appear in the request URL");
  const token = new URLSearchParams(checkout.hash.slice(1)).get("link");
  assert.ok(token);
  return { path: body.path, url: checkout.href, resourceUrl: new URL("/api/x402/pay", baseUrl).href, token };
}

function decodePaymentRequired(header: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as Record<string, unknown>;
}

function encodeHeader(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function linkBody(token: string): string {
  return JSON.stringify({ link: token });
}

function makeApp(facilitator: MockFacilitator, options: { secret?: string; now?: () => number } = {}) {
  return createMerchantApp({
    payLinkSecret: options.secret ?? SECRET,
    facilitator,
    staticDir: null,
    now: options.now,
    recoverSigner: async (message, signature) => {
      assert.equal(signature, TEST_SIGNATURE);
      assert.match(message, /Network: eip155:31611/);
      assert.match(message, /Amount: 3\.25 MUSD/);
      return RECIPIENT;
    },
  });
}

describe("Mezo Testnet x402 pay-link server", () => {
  it("issues a private-fragment checkout URL and settles only against the signed recipient and exact MUSD price", async (t) => {
    const facilitator = new MockFacilitator();
    const running = await startApp(makeApp(facilitator));
    t.after(running.close);

    const link = await createLink(running.baseUrl);
    const challenge = await fetch(link.resourceUrl, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: linkBody(link.token),
    });
    assert.equal(challenge.status, 402);
    assert.equal(challenge.headers.get("cache-control"), "no-store");
    const encoded = challenge.headers.get("payment-required");
    assert.ok(encoded, "x402 core must return the machine-readable PAYMENT-REQUIRED header");
    const required = decodePaymentRequired(encoded);
    const accepts = required.accepts as Array<Record<string, unknown>>;
    assert.equal(required.x402Version, 2);
    assert.equal(accepts.length, 1);
    assert.equal(accepts[0].scheme, "exact");
    assert.equal(accepts[0].network, X402_TESTNET_NETWORK);
    assert.equal(accepts[0].asset, TESTNET_MUSD, "@x402/evm 2.30.0 must resolve Testnet USD pricing to the exact MUSD contract");
    assert.equal(accepts[0].payTo, RECIPIENT);
    assert.equal(accepts[0].amount, "3250000000000000000");
    assert.equal(accepts[0].maxTimeoutSeconds, 300);
    assert.equal((accepts[0].extra as Record<string, unknown>).assetTransferMethod, "permit2");
    assert.equal(JSON.stringify(required.resource).includes(link.token), false, "the challenge resource URL must not disclose the link token");

    const payload = {
      x402Version: 2,
      resource: required.resource,
      accepted: accepts[0],
      payload: { authorization: { from: BUYER }, signature: TEST_SIGNATURE },
    };
    const paid = await fetch(link.resourceUrl, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "PAYMENT-SIGNATURE": encodeHeader(payload) },
      body: linkBody(link.token),
    });
    const paidText = await paid.text();
    assert.equal(paid.status, 200, paidText);
    assert.ok(paid.headers.get("payment-response"), "successful settlement must carry an x402 receipt");
    assert.deepEqual(JSON.parse(paidText), {
      ok: true,
      message: "Payment settled by the facilitator endpoint listed in Mezo's x402 documentation.",
      network: X402_TESTNET_NETWORK,
    });
    assert.equal(facilitator.verifies.length, 1);
    assert.equal(facilitator.settles.length, 1);
    assert.equal(facilitator.verifies[0].network, X402_TESTNET_NETWORK);
    assert.equal(facilitator.verifies[0].payTo, RECIPIENT);
    assert.equal(facilitator.verifies[0].amount, "3250000000000000000");
    assert.equal(facilitator.settles[0].payTo, RECIPIENT);
    assert.equal(facilitator.settles[0].amount, "3250000000000000000");
  });

  it("allows a reusable link to receive another separately submitted checkout request", async (t) => {
    // This verifies the app's no-consumption policy with a mock; it does not establish live facilitator replay behavior.
    const facilitator = new MockFacilitator();
    const running = await startApp(makeApp(facilitator));
    t.after(running.close);
    const link = await createLink(running.baseUrl);

    const submitAttempt = async (signature: `0x${string}`) => {
      const challenge = await fetch(link.resourceUrl, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: linkBody(link.token),
      });
      const encoded = challenge.headers.get("payment-required");
      assert.equal(challenge.status, 402);
      assert.ok(encoded);
      const required = decodePaymentRequired(encoded);
      const accepts = required.accepts as Array<Record<string, unknown>>;
      const payload = { x402Version: 2, resource: required.resource, accepted: accepts[0], payload: { authorization: { from: BUYER }, signature } };
      return fetch(link.resourceUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "PAYMENT-SIGNATURE": encodeHeader(payload) },
        body: linkBody(link.token),
      });
    };

    const first = await submitAttempt(TEST_SIGNATURE);
    assert.equal(first.status, 200, await first.text());
    const secondSignature = `0x${"ef".repeat(65)}` as `0x${string}`;
    const second = await submitAttempt(secondSignature);
    assert.equal(second.status, 200, await second.text());
    assert.equal(facilitator.verifies.length, 2);
    assert.equal(facilitator.settles.length, 2);
  });

  it("never returns a paid response when the facilitator reports settlement failure", async (t) => {
    const facilitator = new MockFacilitator();
    facilitator.settlementSucceeds = false;
    const running = await startApp(makeApp(facilitator));
    t.after(running.close);
    const link = await createLink(running.baseUrl);
    const challenge = await fetch(link.resourceUrl, {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: linkBody(link.token),
    });
    const encoded = challenge.headers.get("payment-required");
    assert.ok(encoded);
    const required = decodePaymentRequired(encoded);
    const accepts = required.accepts as Array<Record<string, unknown>>;
    const payload = { x402Version: 2, resource: required.resource, accepted: accepts[0], payload: { signature: TEST_SIGNATURE } };
    const failed = await fetch(link.resourceUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "PAYMENT-SIGNATURE": encodeHeader(payload) },
      body: linkBody(link.token),
    });
    assert.equal(failed.status, 402);
    assert.equal(facilitator.verifies.length, 1);
    assert.equal(facilitator.settles.length, 1);
    const receipt = failed.headers.get("payment-response");
    assert.ok(receipt, "x402 returns a machine-readable settlement failure receipt");
    assert.equal(JSON.parse(Buffer.from(receipt, "base64").toString("utf8")).success, false);
    assert.notEqual(JSON.parse(await failed.text()).ok, true);
  });

  it("fails closed on a post-settlement receipt mismatch without implying that no payment occurred", async (t) => {
    const mismatches: Array<{ network: `${string}:${string}`; amount: string | null }> = [
      { network: "eip155:31612", amount: null },
      { network: X402_TESTNET_NETWORK, amount: "1" },
    ];
    for (const mismatch of mismatches) {
      const facilitator = new MockFacilitator();
      facilitator.settlementNetwork = mismatch.network;
      facilitator.settlementAmount = mismatch.amount;
      const running = await startApp(makeApp(facilitator));
      t.after(running.close);
      const link = await createLink(running.baseUrl);
      const challenge = await fetch(link.resourceUrl, {
        method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: linkBody(link.token),
      });
      const encoded = challenge.headers.get("payment-required");
      assert.ok(encoded);
      const required = decodePaymentRequired(encoded);
      const accepts = required.accepts as Array<Record<string, unknown>>;
      const payload = { x402Version: 2, resource: required.resource, accepted: accepts[0], payload: { signature: TEST_SIGNATURE } };
      const response = await fetch(link.resourceUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "PAYMENT-SIGNATURE": encodeHeader(payload) },
        body: linkBody(link.token),
      });
      assert.equal(response.status, 502);
      assert.equal(response.headers.get("payment-response"), null);
      const body = await response.json() as { error: string; network: string; transaction?: string };
      assert.equal(body.error, "settlement_receipt_mismatch");
      assert.equal(body.network, mismatch.network);
      assert.equal(body.transaction, FAKE_TX);
      assert.equal(facilitator.verifies.length, 1);
      assert.equal(facilitator.settles.length, 1);
    }
  });

  it("rejects a wrong signer and bad amounts before issuing a link", async (t) => {
    const facilitator = new MockFacilitator();
    const badSignerApp = createMerchantApp({
      payLinkSecret: SECRET,
      facilitator,
      staticDir: null,
      recoverSigner: async () => "0x9999999999999999999999999999999999999999",
    });
    const running = await startApp(badSignerApp);
    t.after(running.close);

    const now = Date.now();
    const body = { recipient: RECIPIENT, amount: "3.25", issuedAt: now, nonce: "b".repeat(32), signature: TEST_SIGNATURE };
    const rejected = await fetch(`${running.baseUrl}/api/pay-links`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    assert.equal(rejected.status, 401);
    assert.equal((await rejected.json() as { error: string }).error, "recipient_not_controlled");

    const invalidAmount = await fetch(`${running.baseUrl}/api/pay-links`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, amount: "1000.0001" }),
    });
    assert.equal(invalidAmount.status, 400);
    assert.equal(facilitator.verifies.length, 0);
    assert.equal(facilitator.settles.length, 0);
  });

  it("rejects replayed seller link-creation authorizations", async (t) => {
    const facilitator = new MockFacilitator();
    const running = await startApp(makeApp(facilitator));
    t.after(running.close);
    const body = {
      recipient: RECIPIENT,
      amount: "3.25",
      issuedAt: Date.now(),
      nonce: "c".repeat(32),
      signature: TEST_SIGNATURE,
    };
    const request = () => fetch(`${running.baseUrl}/api/pay-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const first = await request();
    assert.equal(first.status, 201);
    await first.arrayBuffer();
    const replay = await request();
    assert.equal(replay.status, 409);
    assert.equal((await replay.json() as { error: string }).error, "authorization_replayed");
    assert.equal(facilitator.verifies.length, 0);
    assert.equal(facilitator.settles.length, 0);
  });

  it("rejects tampered and expired tokens before making facilitator requests", async (t) => {
    let clock = Date.now();
    const facilitator = new MockFacilitator();
    const running = await startApp(makeApp(facilitator, { now: () => clock }));
    t.after(running.close);
    const link = await createLink(running.baseUrl, clock);
    const tamperedToken = `x${link.token}`;
    const bad = await fetch(link.resourceUrl, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: linkBody(tamperedToken),
    });
    assert.equal(bad.status, 404);

    clock += 31 * 24 * 60 * 60 * 1000;
    const expired = await fetch(link.resourceUrl, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: linkBody(link.token),
    });
    assert.equal(expired.status, 404);
    assert.equal(facilitator.verifies.length, 0);
    assert.equal(facilitator.settles.length, 0);
  });

  it("fails closed when the server-only HMAC secret is missing or too short", async (t) => {
    const app = createMerchantApp({ facilitator: new MockFacilitator(), staticDir: null });
    const running = await startApp(app);
    t.after(running.close);
    const response = await fetch(`${running.baseUrl}/api/pay-links`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json() as { error: string }).error, "not_configured");

    const weak = await fetch(`${running.baseUrl}/api/pay-links/status`);
    assert.deepEqual(await weak.json(), { enabled: false, network: X402_TESTNET_NETWORK, facilitator: "https://facilitator.vativ.io" });
  });
});

describe("API not-found behavior with SPA serving enabled", () => {
  it("returns JSON 404s for unmatched API paths while preserving the client-route fallback", async (t) => {
    const staticDir = await mkdtemp(join(tmpdir(), "mezovault-iq-static-"));
    await writeFile(join(staticDir, "index.html"), "<!doctype html><title>SPA fixture</title>", "utf8");
    t.after(async () => { await rm(staticDir, { recursive: true, force: true }); });

    const running = await startApp(createMerchantApp({ facilitator: new MockFacilitator(), staticDir }));
    t.after(running.close);

    for (const path of ["/api", "/api/no-such-route", "/api/pay-links"]) {
      const response = await fetch(`${running.baseUrl}${path}`);
      assert.equal(response.status, 404, path);
      assert.match(response.headers.get("content-type") ?? "", /^application\/json/i, path);
      assert.equal((await response.json() as { error: string }).error, "not_found");
    }

    const head = await fetch(`${running.baseUrl}/api/no-such-route`, { method: "HEAD" });
    assert.equal(head.status, 404);
    assert.match(head.headers.get("content-type") ?? "", /^application\/json/i);

    const unknownPost = await fetch(`${running.baseUrl}/api/no-such-route`, { method: "POST" });
    assert.equal(unknownPost.status, 404);
    assert.match(unknownPost.headers.get("content-type") ?? "", /^application\/json/i);

    const clientRoute = await fetch(`${running.baseUrl}/some-client-route`);
    assert.equal(clientRoute.status, 200);
    assert.match(clientRoute.headers.get("content-type") ?? "", /^text\/html/i);
    assert.match(await clientRoute.text(), /SPA fixture/);
  });
});
