import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildLinkAuthorizationMessage, normalizeMUSDLinkAmount, normalizeMUSDRecipient, X402_TESTNET_NETWORK } from "./x402PayLinks";

const RECIPIENT = "0x1111111111111111111111111111111111111111";

describe("MUSD x402 link validation", () => {
  it("normalizes decimal values without floating-point conversion", () => {
    assert.deepEqual(normalizeMUSDLinkAmount("0003.2500"), { amount: "3.25", error: null });
    assert.deepEqual(normalizeMUSDLinkAmount("0.001"), { amount: "0.001", error: null });
    assert.deepEqual(normalizeMUSDLinkAmount("1000.000000000000000000"), { amount: "1000", error: null });
    assert.deepEqual(normalizeMUSDLinkAmount("0.000000000000000001"), {
      amount: null,
      error: "The minimum x402 link amount is 0.001 MUSD.",
    });
  });

  it("rejects scientific notation, over-precision, zero, negative, and out-of-policy amounts", () => {
    for (const invalid of ["0", "-1", "1e2", "1000.0001", "1.0000000000000000001", "NaN", "1,000", `${"0".repeat(129)}1`]) {
      assert.notEqual(normalizeMUSDLinkAmount(invalid).error, null, `should reject ${invalid}`);
    }
  });

  it("accepts valid non-zero EVM recipients in normalized lowercase form", () => {
    assert.equal(normalizeMUSDRecipient(RECIPIENT.toUpperCase().replace("0X", "0x")), RECIPIENT);
    assert.equal(normalizeMUSDRecipient("not an address"), null);
    assert.equal(normalizeMUSDRecipient(`0x${"0".repeat(40)}`), null);
  });

  it("binds seller consent to recipient, amount, network, time, and nonce", () => {
    const message = buildLinkAuthorizationMessage({ recipient: RECIPIENT, amount: "03.250", issuedAt: 1_800_000_000_000, nonce: "a".repeat(32) });
    assert.match(message, new RegExp(`Network: ${X402_TESTNET_NETWORK}`));
    assert.match(message, new RegExp(`Recipient: ${RECIPIENT}`));
    assert.match(message, /Amount: 3\.25 MUSD/);
    assert.match(message, /Issued at: 1800000000000/);
    assert.match(message, /Nonce: a{32}/);
    assert.match(message, /does not transfer MUSD or pay gas/);
  });
});
