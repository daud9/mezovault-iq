import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchStrategies, validatePreferences, isRiskAllowed, type StrategyPreferences } from "./matching";
import { FIXTURE_PROFILES as STRATEGY_PROFILES } from "./testFixtures";
import type { StrategyProfile } from "./types";

const prefs = (o: Partial<StrategyPreferences> = {}): StrategyPreferences => ({
  capitalUsd: 10_000,
  risk: "Aggressive",
  horizonMonths: 24,
  maxExitDays: null,
  targetYieldPct: 0,
  ...o,
});

const byId = (id: string) => STRATEGY_PROFILES.find((p) => p.id === id)!;

describe("risk tolerance", () => {
  it("Conservative allows only Low risk", () => {
    assert.equal(isRiskAllowed("Conservative", "Low"), true);
    assert.equal(isRiskAllowed("Conservative", "Medium"), false);
    assert.equal(isRiskAllowed("Conservative", "High"), false);
  });

  it("Moderate excludes High risk", () => {
    assert.equal(isRiskAllowed("Moderate", "Medium"), true);
    assert.equal(isRiskAllowed("Moderate", "High"), false);
  });

  it("Aggressive allows all risk levels", () => {
    assert.equal(isRiskAllowed("Aggressive", "High"), true);
  });
});

describe("hard constraints decide eligibility", () => {
  it("excludes a strategy whose minimum capital is not met", () => {
    const m = matchStrategies([byId("looping-strategy")], prefs({ capitalUsd: 500 }))[0];
    assert.equal(m.eligible, false);
    assert.equal(m.checks.find((c) => c.key === "capital")?.status, "conflicts");
  });

  it("excludes a strategy whose horizon is too short", () => {
    const m = matchStrategies([byId("liquidity-pool-balanced")], prefs({ horizonMonths: 3 }))[0];
    assert.equal(m.eligible, false);
    assert.equal(m.checks.find((c) => c.key === "horizon")?.status, "conflicts");
  });

  it("excludes a strategy above the risk tolerance", () => {
    const m = matchStrategies([byId("looping-strategy")], prefs({ risk: "Conservative" }))[0];
    assert.equal(m.eligible, false);
    assert.equal(m.checks.find((c) => c.key === "risk")?.status, "conflicts");
  });

  it("excludes a strategy that exits slower than the liquidity requirement", () => {
    const m = matchStrategies([byId("mezo-staking-derivative")], prefs({ maxExitDays: 7 }))[0];
    assert.equal(m.eligible, false);
    assert.equal(m.checks.find((c) => c.key === "liquidity")?.status, "conflicts");
  });

  it("treats an unknown exit time as unknown, not conflicting", () => {
    const profile: StrategyProfile = { ...byId("musd-stable-vault"), liquidityDays: null };
    const m = matchStrategies([profile], prefs({ maxExitDays: 1 }))[0];
    assert.equal(m.checks.find((c) => c.key === "liquidity")?.status, "unknown");
    assert.equal(m.eligible, true);
    assert.equal(m.hasUnknowns, true);
  });

  it("does not exclude a strategy for a missed target yield", () => {
    const m = matchStrategies([byId("musd-stable-vault")], prefs({ targetYieldPct: 50 }))[0];
    assert.equal(m.checks.find((c) => c.key === "yield")?.status, "conflicts");
    assert.equal(m.eligible, true);
  });
});

describe("ranking", () => {
  it("ranks fully verified eligible strategies above ones with unknowns", () => {
    const verified = { ...byId("musd-stable-vault") };
    const unknown: StrategyProfile = { ...byId("musd-collateral-lending"), liquidityDays: null };
    const ranked = matchStrategies([unknown, verified], prefs({ maxExitDays: 7 }));
    assert.equal(ranked[0].profile.id, verified.id);
    assert.equal(ranked[1].profile.id, unknown.id);
  });

  it("ranks ineligible strategies last", () => {
    const ranked = matchStrategies(STRATEGY_PROFILES, prefs({ risk: "Conservative" }));
    const last = ranked[ranked.length - 1];
    assert.equal(last.eligible, false);
    assert.equal(ranked[0].eligible, true);
  });

  it("assigns sequential ranks", () => {
    const ranked = matchStrategies(STRATEGY_PROFILES, prefs());
    assert.deepEqual(ranked.map((m) => m.rank), [1, 2, 3, 4, 5]);
  });

  it("is deterministic across repeated calls", () => {
    const a = matchStrategies(STRATEGY_PROFILES, prefs({ targetYieldPct: 7 })).map((m) => m.profile.id);
    const b = matchStrategies(STRATEGY_PROFILES, prefs({ targetYieldPct: 7 })).map((m) => m.profile.id);
    assert.deepEqual(a, b);
  });
});

describe("preference validation", () => {
  it("accepts valid preferences", () => {
    assert.deepEqual(validatePreferences(prefs()), []);
  });

  it("rejects zero, negative and non-numeric capital", () => {
    assert.ok(validatePreferences(prefs({ capitalUsd: 0 })).length > 0);
    assert.ok(validatePreferences(prefs({ capitalUsd: -5 })).length > 0);
    assert.ok(validatePreferences(prefs({ capitalUsd: Number.NaN })).length > 0);
  });

  it("rejects an out-of-range target yield", () => {
    assert.ok(validatePreferences(prefs({ targetYieldPct: -1 })).length > 0);
    assert.ok(validatePreferences(prefs({ targetYieldPct: 101 })).length > 0);
  });
});
