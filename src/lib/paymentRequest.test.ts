import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSendQuery, parsePaymentParams } from "./paymentRequest";
import { SUPPORT_ADDRESS } from "../config/support";

const TO = "0x55039a1999313f5ff80c788cc676bf58fbb40bde" as const;

describe("payment request links", () => {
  it("builds a query that round-trips through the parser", () => {
    const q = buildSendQuery({ to: TO, token: "MUSD", amount: "1.5" });
    const parsed = parsePaymentParams(new URLSearchParams(q));
    assert.equal(parsed.error, null);
    assert.deepEqual(parsed.request, { to: TO, token: "MUSD", amount: "1.5" });
  });

  it("refuses an invalid recipient, zero amount or malformed amount", () => {
    assert.throws(() => buildSendQuery({ to: "0x123" as `0x${string}`, token: "BTC", amount: "1" }));
    assert.throws(() => buildSendQuery({ to: TO, token: "BTC", amount: "0" }));
    assert.throws(() => buildSendQuery({ to: TO, token: "BTC", amount: "1e3" }));
  });

  it("returns no request when no payment parameters are present", () => {
    assert.deepEqual(parsePaymentParams(new URLSearchParams("")), { error: null, request: null });
  });

  it("reports an invalid recipient in a link without filling the form", () => {
    const p = parsePaymentParams(new URLSearchParams("to=bad&token=BTC&amount=1"));
    assert.equal(p.request, null);
    assert.match(p.error ?? "", /invalid recipient/);
  });

  it("rejects an unknown token and a malformed amount", () => {
    assert.match(parsePaymentParams(new URLSearchParams(`to=${TO}&token=DOGE&amount=1`)).error ?? "", /unknown token/);
    assert.match(parsePaymentParams(new URLSearchParams(`to=${TO}&token=BTC&amount=abc`)).error ?? "", /invalid amount/);
  });

  it("accepts the configured support address", () => {
    const p = parsePaymentParams(new URLSearchParams(`to=${SUPPORT_ADDRESS}&token=BTC&amount=0.001`));
    assert.equal(p.error, null);
    assert.equal(p.request?.to, SUPPORT_ADDRESS);
  });
});
