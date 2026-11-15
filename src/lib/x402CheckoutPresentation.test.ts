import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getX402CheckoutAction } from "./x402CheckoutPresentation";

describe("x402 checkout action priority", () => {
  it("shows a confirmed receipt before asking to connect or switch wallets", () => {
    assert.equal(getX402CheckoutAction({
      connected: false,
      onTestnet: false,
      hasReceipt: true,
      paymentStatusUnknown: false,
    }), "settled");
    assert.equal(getX402CheckoutAction({
      connected: true,
      onTestnet: false,
      hasReceipt: true,
      paymentStatusUnknown: false,
    }), "settled");
  });

  it("keeps an unresolved payment warning ahead of wallet connect and network prompts", () => {
    assert.equal(getX402CheckoutAction({
      connected: false,
      onTestnet: false,
      hasReceipt: false,
      paymentStatusUnknown: true,
    }), "unresolved");
    assert.equal(getX402CheckoutAction({
      connected: true,
      onTestnet: false,
      hasReceipt: false,
      paymentStatusUnknown: true,
    }), "unresolved");
  });

  it("shows wallet prompts or payment only when no prior outcome needs attention", () => {
    assert.equal(getX402CheckoutAction({ connected: false, onTestnet: false, hasReceipt: false, paymentStatusUnknown: false }), "connect-wallet");
    assert.equal(getX402CheckoutAction({ connected: true, onTestnet: false, hasReceipt: false, paymentStatusUnknown: false }), "switch-network");
    assert.equal(getX402CheckoutAction({ connected: true, onTestnet: true, hasReceipt: false, paymentStatusUnknown: false }), "pay");
  });

  it("keeps an explicit confirmed receipt higher priority than an unresolved flag", () => {
    assert.equal(getX402CheckoutAction({
      connected: false,
      onTestnet: false,
      hasReceipt: true,
      paymentStatusUnknown: true,
    }), "settled");
  });
});
