import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreYieldQuality, liquidityValue, MIN_COVERAGE_PCT, SCORE_WEIGHTS } from "./scoring";
import { STRATEGY_PROFILES } from "./catalog";
import type { StrategyProfile } from "./types";

function base(overrides: Partial<StrategyProfile> = {}): StrategyProfile {
  return { ...STRATEGY_PROFILES[0], ...overrides } as StrategyProfile;
}

describe("liquidity scoring thresholds", () => {
  it("maps exit days to documented bands", () => {
    assert.equal(liquidityValue(0), 100);
    assert.equal(liquidityValue(1), 100);
    assert.equal(liquidityValue(2), 70);
    assert.equal(liquidityValue(7), 70);
    assert.equal(liquidityValue(8), 40);
    assert.equal(liquidityValue(14), 40);
    assert.equal(liquidityValue(15), 10);
  });

  it("treats unknown or invalid exit times as unknown", () => {
    assert.equal(liquidityValue(null), null);
    assert.equal(liquidityValue(-1), null);
    assert.equal(liquidityValue(Number.NaN), null);
  });
});

describe("Yield Quality Score", () => {
  it("averages only known components with their weights", () => {
    const profile = base({
      yieldSource: { description: "x", clarity: "clear" }, // 100, weight 25
      liquidityDays: 7, // 70, weight 25
      protocol: { ...base().protocol, auditStatus: "verified-audit" }, // 100, weight 25
      historicalPerformanceScore: 40, // weight 25
    });
    const q = scoreYieldQuality(profile);
    assert.equal(q.coveragePct, 100);
    assert.equal(q.score, round1((100 * 25 + 70 * 25 + 100 * 25 + 40 * 25) / 100));
    assert.equal(q.label, "Scored");
  });

  it("does not count unknown components as zero", () => {
    const profile = base({
      yieldSource: { description: "x", clarity: "clear" }, // 100
      liquidityDays: 1, // 100
      protocol: { ...base().protocol, auditStatus: "unknown" },
      historicalPerformanceScore: null,
    });
    const q = scoreYieldQuality(profile);
    assert.equal(q.coveragePct, 50);
    assert.equal(q.score, 100, "assessment averages known components only");
    assert.equal(q.adjustedScore, 50, "evidence-adjusted score counts unknown components as zero");
    assert.equal(q.label, "Partial evidence");
  });

  it("returns no score when coverage is below the minimum", () => {
    const profile = base({
      yieldSource: { description: "x", clarity: "unclear" }, // only 25% known
      liquidityDays: null,
      protocol: { ...base().protocol, auditStatus: "unknown" },
      historicalPerformanceScore: null,
    });
    const q = scoreYieldQuality(profile);
    assert.equal(q.coveragePct, 25);
    assert.ok(q.coveragePct < MIN_COVERAGE_PCT);
    assert.equal(q.score, null);
    assert.equal(q.label, "Insufficient evidence");
  });

  it("evidence-adjusted score equals the assessment when everything is known", () => {
    const q = scoreYieldQuality(
      base({
        yieldSource: { description: "x", clarity: "clear" },
        liquidityDays: 1,
        protocol: { ...base().protocol, auditStatus: "partial-review" },
        historicalPerformanceScore: 100,
      }),
    );
    assert.equal(q.coveragePct, 100);
    assert.equal(q.adjustedScore, q.score);
  });

  it("missing evidence never raises the adjusted score above the assessment", () => {
    for (const p of STRATEGY_PROFILES) {
      const q = scoreYieldQuality(p);
      if (q.score !== null) assert.ok(q.adjustedScore <= q.score + 0.001, `${p.id} adjusted must not exceed assessment`);
    }
  });

  it("is deterministic for identical inputs", () => {
    const a = scoreYieldQuality(STRATEGY_PROFILES[2]);
    const b = scoreYieldQuality(STRATEGY_PROFILES[2]);
    assert.deepEqual(a, b);
  });

  it("clamps historical scores to 0-100", () => {
    const high = scoreYieldQuality(base({ historicalPerformanceScore: 250 }));
    const low = scoreYieldQuality(base({ historicalPerformanceScore: -30 }));
    const hComp = high.components.find((c) => c.key === "historicalPerformance");
    const lComp = low.components.find((c) => c.key === "historicalPerformance");
    assert.equal(hComp?.value, 100);
    assert.equal(lComp?.value, 0);
  });

  it("exposes weights that sum to 100", () => {
    const total = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.equal(total, 100);
  });
});

describe("demonstration catalogue honesty", () => {
  it("never records verified audits, addresses or historical data", () => {
    for (const p of STRATEGY_PROFILES) {
      assert.equal(p.protocol.auditStatus, "unknown", `${p.id} audit must be unknown`);
      assert.equal(p.protocol.contractAddress, null, `${p.id} must not invent an address`);
      assert.equal(p.protocol.auditReference, null, `${p.id} must not invent an audit link`);
      assert.equal(p.historicalPerformanceScore, null, `${p.id} must not invent history`);
    }
  });

  it("labels every entry as demonstration data", () => {
    for (const p of STRATEGY_PROFILES) {
      assert.match(p.dataSource.label, /Demonstration/i, `${p.id} must be labelled as demonstration`);
    }
  });

  it("covers every demonstration strategy", () => {
    assert.equal(STRATEGY_PROFILES.length, 5);
  });
});

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
