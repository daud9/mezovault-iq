import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatTokenUnits, groupThousands } from "./tokenAmount";

const E18 = 10n ** 18n;

describe("formatTokenUnits", () => {
  it("formats zero without decimals", () => {
    assert.equal(formatTokenUnits(0n, 18), "0");
  });

  it("formats whole and fractional amounts", () => {
    assert.equal(formatTokenUnits(E18, 18), "1");
    assert.equal(formatTokenUnits(E18 * 3n / 2n, 18), "1.5");
    assert.equal(formatTokenUnits(245_201_907_550_000_000_000n, 18), "245.201907");
    assert.equal(formatTokenUnits(245_201_907_550_000_000_000n, 18, 8), "245.20190755");
  });

  it("strips trailing zeros in the fraction", () => {
    assert.equal(formatTokenUnits(1_000_000_000_000_000_000n + 100_000_000_000_000_000n, 18), "1.1");
  });

  it("groups thousands", () => {
    assert.equal(formatTokenUnits(1_234_567n * E18, 18), "1,234,567");
    assert.equal(groupThousands("1234567890"), "1,234,567,890");
    assert.equal(groupThousands("999"), "999");
  });

  it("truncates rather than rounds, so balances are never overstated", () => {
    // 0.9999999 MUSD displayed at 6 digits must not become 1.
    assert.equal(formatTokenUnits(999_999_900_000_000_000n, 18, 6), "0.999999");
    assert.equal(formatTokenUnits(999_999_900_000_000_000n, 18, 18), "0.9999999");
  });

  it("shows a non-zero dust balance as below the display precision", () => {
    assert.equal(formatTokenUnits(1n, 18, 6), "<0.000001");
    assert.equal(formatTokenUnits(1n, 18, 0), "<1");
  });

  it("returns the exact value when full precision is requested", () => {
    assert.equal(formatTokenUnits(1n, 18, 18), "0.000000000000000001");
  });

  it("handles zero decimals", () => {
    assert.equal(formatTokenUnits(42n, 0, 0), "42");
  });

  it("rejects negative balances", () => {
    assert.throws(() => formatTokenUnits(-1n, 18), /Negative/);
  });

  it("rejects invalid decimals and precision", () => {
    assert.throws(() => formatTokenUnits(1n, -1));
    assert.throws(() => formatTokenUnits(1n, 1.5));
    assert.throws(() => formatTokenUnits(1n, 6, 7));
  });
});
