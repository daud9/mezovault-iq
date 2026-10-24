import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { VERIFIED_STRATEGY_PROFILES } from "./catalog";

describe("verified strategy catalogue", () => {
  it("lists no strategies until each one is backed by a verified contract", () => {
    assert.equal(VERIFIED_STRATEGY_PROFILES.length, 0);
  });
});
