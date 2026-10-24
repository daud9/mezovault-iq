import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateAllocation, validateAllocation, floorCents, type AllocationRequest } from "./allocation";
import { STRATEGY_PROFILES } from "./catalog";
import type { StrategyProfile } from "./types";

const ALL_IDS = STRATEGY_PROFILES.map((p) => p.id);

const req = (o: Partial<AllocationRequest> = {}): AllocationRequest => ({
  capitalUsd: 10_000,
  minReserveUsd: 1_000,
  maxAllocationPct: 40,
  risk: "Aggressive",
  eligibleIds: ALL_IDS,
  ...o,
});

const sumLines = (lines: { amountUsd: number }[]) => lines.reduce((s, l) => s + l.amountUsd, 0);

describe("constraints are respected", () => {
  it("no line exceeds the per-strategy cap", () => {
    const r = generateAllocation(req(), STRATEGY_PROFILES);
    for (const line of r.lines) {
      assert.ok(line.amountUsd <= r.lines[0].capUsd + 0.001, `${line.name} exceeds cap`);
      assert.ok(line.percentOfCapital <= 40 + 0.01);
    }
  });

  it("the reserve is never invested", () => {
    const r = generateAllocation(req(), STRATEGY_PROFILES);
    assert.ok(sumLines(r.lines) <= 10_000 - 1_000 + 0.001);
    assert.equal(r.reserveUsd, 1_000);
  });

  it("allocated + unplaced + reserve equals capital", () => {
    const r = generateAllocation(req(), STRATEGY_PROFILES);
    assert.ok(Math.abs(r.allocatedUsd + r.unplacedUsd + r.reserveUsd - 10_000) < 0.011);
    assert.ok(Math.abs(r.cashHeldUsd - (10_000 - r.allocatedUsd)) < 0.011);
  });

  it("every line meets its strategy's minimum capital", () => {
    const r = generateAllocation(req({ capitalUsd: 3_000, minReserveUsd: 0, maxAllocationPct: 30 }), STRATEGY_PROFILES);
    for (const line of r.lines) {
      const p = STRATEGY_PROFILES.find((x) => x.id === line.strategyId)!;
      assert.ok(line.amountUsd >= p.minCapitalUsd, `${p.name} below its minimum`);
    }
  });

  it("amounts are rounded down to cents so totals never overshoot", () => {
    const r = generateAllocation(req({ capitalUsd: 10_000.37, minReserveUsd: 0.37, maxAllocationPct: 33.33 }), STRATEGY_PROFILES);
    assert.ok(r.allocatedUsd <= 10_000, "must not exceed the deployable amount");
    for (const line of r.lines) {
      assert.equal(Math.round(line.amountUsd * 100), line.amountUsd * 100, "amount must be whole cents");
    }
  });
});

describe("feasibility and infeasible constraints", () => {
  it("reports invalid when the reserve is not below capital", () => {
    const r = generateAllocation(req({ minReserveUsd: 10_000 }), STRATEGY_PROFILES);
    assert.equal(r.status, "invalid");
    assert.ok(r.errors.some((e) => e.includes("less than total capital")));
  });

  it("reports invalid for an out-of-range cap", () => {
    assert.ok(validateAllocation(req({ maxAllocationPct: 0 })).length > 0);
    assert.ok(validateAllocation(req({ maxAllocationPct: 120 })).length > 0);
  });

  it("reports infeasible when no strategy is selected", () => {
    const r = generateAllocation(req({ eligibleIds: [] }), STRATEGY_PROFILES);
    assert.equal(r.status, "infeasible");
    assert.equal(r.lines.length, 0);
    assert.equal(r.allocatedUsd, 0);
  });

  it("reports infeasible when every selected strategy is outside the risk preference", () => {
    const r = generateAllocation(req({ risk: "Conservative", eligibleIds: ["looping-strategy"] }), STRATEGY_PROFILES);
    assert.equal(r.status, "infeasible");
    assert.equal(r.skipped.length, 1);
  });

  it("reports partial with the unplaced amount when caps cannot absorb all capital", () => {
    // One Low-risk strategy at 20% cap: at most $2,000 can be placed out of $9,000 deployable.
    const r = generateAllocation(
      req({ maxAllocationPct: 20, risk: "Conservative", eligibleIds: ["musd-stable-vault"] }),
      STRATEGY_PROFILES,
    );
    assert.equal(r.status, "partial");
    assert.equal(r.allocatedUsd, 2_000);
    assert.equal(r.unplacedUsd, 7_000);
    assert.ok(r.warnings.some((w) => w.includes("stays unplaced")));
  });

  it("reports ok when caps comfortably absorb the deployable capital", () => {
    const r = generateAllocation(req({ maxAllocationPct: 100 }), STRATEGY_PROFILES);
    assert.equal(r.status, "ok");
    assert.equal(r.unplacedUsd, 0);
    assert.ok(Math.abs(r.allocatedUsd - 9_000) < 0.01);
  });
});

describe("risk preference and ordering", () => {
  it("Conservative only allocates to Low-risk strategies", () => {
    const r = generateAllocation(req({ risk: "Conservative", maxAllocationPct: 100 }), STRATEGY_PROFILES);
    for (const line of r.lines) assert.equal(line.risk, "Low");
  });

  it("higher-scored strategies receive capital first", () => {
    const r = generateAllocation(req({ maxAllocationPct: 100 }), STRATEGY_PROFILES);
    const scores = r.lines.map((l) => l.qualityScore ?? -1);
    const sorted = [...scores].sort((a, b) => b - a);
    assert.deepEqual(scores, sorted);
  });

  it("is deterministic", () => {
    const a = generateAllocation(req(), STRATEGY_PROFILES);
    const b = generateAllocation(req(), STRATEGY_PROFILES);
    assert.deepEqual(a, b);
  });

  it("flags skipped strategies whose minimum capital is not reached", () => {
    const tiny: StrategyProfile[] = [{ ...STRATEGY_PROFILES[0], id: "tiny", minCapitalUsd: 5_000 }];
    const r = generateAllocation(req({ capitalUsd: 1_000, minReserveUsd: 0, maxAllocationPct: 50, eligibleIds: ["tiny"] }), tiny);
    assert.equal(r.lines.length, 0);
    assert.equal(r.skipped.length, 1);
    assert.match(r.skipped[0].reason, /minimum/);
  });

  it("every allocation line includes reasoning and labelled illustrative projection", () => {
    const r = generateAllocation(req(), STRATEGY_PROFILES);
    for (const line of r.lines) {
      assert.ok(line.reasoning.length > 0);
      assert.ok(line.illustrativeOneYearUsd > 0);
    }
  });
});

describe("helpers", () => {
  it("floorCents rounds down and tolerates float noise", () => {
    assert.equal(floorCents(1.999), 1.99);
    assert.equal(floorCents(0.29 * 100 / 100), 0.29);
    assert.equal(floorCents(10), 10);
  });
});
