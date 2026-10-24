import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SELECTORS, decodeAbiString, decodeUint256, encodeBalanceOf, isAddress } from "./abi";
import { encodeStringResult, encodeUintResult, OWNER } from "./testHelpers";

describe("ERC-20 selectors", () => {
  it("match the standard function signatures", () => {
    assert.equal(SELECTORS.balanceOf, "0x70a08231");
    assert.equal(SELECTORS.decimals, "0x313ce567");
    assert.equal(SELECTORS.symbol, "0x95d89b41");
  });
});

describe("balanceOf encoding", () => {
  it("pads the owner address to one 32-byte word, lowercase", () => {
    const data = encodeBalanceOf("0xAbCdEf0123456789AbCdEf0123456789AbCdEf01");
    assert.equal(data, "0x70a08231000000000000000000000000abcdef0123456789abcdef0123456789abcdef01");
    assert.equal(data.length, 2 + 8 + 64);
  });

  it("rejects malformed addresses", () => {
    assert.throws(() => encodeBalanceOf("0x1234"));
    assert.throws(() => encodeBalanceOf("not-an-address"));
  });
});

describe("address validation", () => {
  it("accepts 40 hex characters after 0x", () => {
    assert.equal(isAddress(OWNER), true);
  });

  it("rejects wrong length, missing prefix, and non-strings", () => {
    assert.equal(isAddress("0x111"), false);
    assert.equal(isAddress("1111111111111111111111111111111111111111"), false);
    assert.equal(isAddress(undefined), false);
    assert.equal(isAddress(12), false);
  });
});

describe("uint256 decoding", () => {
  it("decodes zero and large values", () => {
    assert.equal(decodeUint256(encodeUintResult(0n)), 0n);
    assert.equal(decodeUint256(encodeUintResult(1_500_000_000_000_000_000n)), 1_500_000_000_000_000_000n);
    assert.equal(decodeUint256(encodeUintResult(2n ** 256n - 1n)), 2n ** 256n - 1n);
  });

  it("treats empty return data as an error, not zero", () => {
    assert.throws(() => decodeUint256("0x"), /Empty/);
  });

  it("rejects non-hex and over-long data", () => {
    assert.throws(() => decodeUint256("0xzz"));
    assert.throws(() => decodeUint256("0x" + "1".repeat(66)));
  });

  it("requires a 0x prefix", () => {
    assert.throws(() => decodeUint256("123"));
  });
});

describe("string decoding", () => {
  it("decodes a standard ABI-encoded symbol", () => {
    assert.equal(decodeAbiString(encodeStringResult("MUSD")), "MUSD");
  });

  it("decodes a name longer than one word", () => {
    assert.equal(decodeAbiString(encodeStringResult("Mezo USD Stablecoin Testnet Token Name")), "Mezo USD Stablecoin Testnet Token Name");
  });

  it("rejects truncated data", () => {
    const full = encodeStringResult("MUSD");
    assert.throws(() => decodeAbiString(full.slice(0, 130)));
  });

  it("rejects invalid UTF-8 rather than displaying garbage", () => {
    const bad = `0x${(32).toString(16).padStart(64, "0")}${(2).toString(16).padStart(64, "0")}ff${"fe".padEnd(62, "0")}`;
    assert.throws(() => decodeAbiString(bad));
  });
});
