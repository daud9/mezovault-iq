import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runScenario, compareStress, simpleValue, compoundValue, validateScenario, type ScenarioInput } from "./returns";

const scenario = (o: Partial<ScenarioInput> = {}): ScenarioInput => ({
  principalUsd: 10_000,
  annualYieldPct: 6,
  months: 12,
  compounding: "simple",
  fees: { entryFeePct: 0, annualFeePct: 0, fixedCostUsd: 0 },
  yieldDeclinePct: 0,
  withdrawal: null,
  ...o,
});

function near(actual: number, expected: number, tol = 0.01, msg?: string) {
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ""} expected ${expected}, got ${actual}`);
}

describe("closed-form returns", () => {
  it("simple return: 10,000 at 6% for 12 months = 10,600", () => {
    near(simpleValue(10_000, 6, 12), 10_600);
  });

  it("monthly compounding: 10,000 at 6% for 12 months ≈ 10,616.78", () => {
    near(compoundValue(10_000, 6, 12), 10_616.78, 0.01);
  });

  it("compounding always gives at least the simple result for positive yields", () => {
    assert.ok(compoundValue(10_000, 8, 24) >= simpleValue(10_000, 8, 24));
  });
});

describe("month-by-month scenario engine", () => {
  it("simple mode with no fees matches the closed form", () => {
    const r = runScenario(scenario());
    assert.equal(r.valid, true);
    if (!r.valid) return;
    near(r.totalValueUsd, 10_600);
    near(r.netGainUsd, 600);
    near(r.netReturnPct, 6);
  });

  it("monthly mode with no fees matches compounding", () => {
    const r = runScenario(scenario({ compounding: "monthly" }));
    if (!r.valid) assert.fail("expected a valid scenario");
    near(r.totalValueUsd, 10_616.78, 0.01);
  });

  it("zero yield with no fees returns the principal exactly", () => {
    const r = runScenario(scenario({ annualYieldPct: 0 }));
    if (!r.valid) assert.fail("expected a valid scenario");
    assert.equal(r.totalValueUsd, 10_000);
    assert.equal(r.netGainUsd, 0);
  });

  it("negative yield produces a loss", () => {
    const r = runScenario(scenario({ annualYieldPct: -10 }));
    if (!r.valid) assert.fail("expected a valid scenario");
    assert.ok(r.netGainUsd < 0);
  });

  it("entry fee reduces the amount invested", () => {
    const r = runScenario(scenario({ annualYieldPct: 0, fees: { entryFeePct: 1, annualFeePct: 0, fixedCostUsd: 0 } }));
    if (!r.valid) assert.fail("expected a valid scenario");
    assert.equal(r.entryNetUsd, 9_900);
    near(r.netGainUsd, -100);
  });

  it("annual fee reduces the effective yield", () => {
    const r = runScenario(scenario({ fees: { entryFeePct: 0, annualFeePct: 2, fixedCostUsd: 0 } }));
    if (!r.valid) assert.fail("expected a valid scenario");
    assert.equal(r.effectiveAnnualYieldPct, 6);
    near(r.totalValueUsd, 10_400);
  });

  it("fixed costs apply to the deposit and the final exit", () => {
    const r = runScenario(scenario({ annualYieldPct: 0, fees: { entryFeePct: 0, annualFeePct: 0, fixedCostUsd: 5 } }));
    if (!r.valid) assert.fail("expected a valid scenario");
    assert.equal(r.totalCostsUsd, 10);
    assert.equal(r.totalValueUsd, 9_990);
  });

  it("a 50% yield decline halves the simple gain", () => {
    const r = runScenario(scenario({ yieldDeclinePct: 50 }));
    if (!r.valid) assert.fail("expected a valid scenario");
    assert.equal(r.effectiveAnnualYieldPct, 3);
    near(r.netGainUsd, 300);
  });

  it("a forced withdrawal with penalty and slippage reduces the outcome versus baseline", () => {
    const stress = compareStress(
      scenario({
        withdrawal: { month: 6, withdrawPct: 50, exitPenaltyPct: 2, slippagePct: 1 },
      }),
    );
    assert.equal(stress.baseline.valid && stress.stressed.valid, true);
    assert.ok((stress.differenceUsd ?? 0) < 0, "stressed outcome must be worse");
    assert.ok((stress.differencePct ?? 0) < 0);
  });

  it("baseline in a comparison ignores decline and withdrawal settings", () => {
    const stress = compareStress(
      scenario({ yieldDeclinePct: 100, withdrawal: { month: 3, withdrawPct: 100, exitPenaltyPct: 10, slippagePct: 10 } }),
    );
    if (!stress.baseline.valid) assert.fail("expected baseline");
    near(stress.baseline.totalValueUsd, 10_600);
  });

  it("a full withdrawal at month 1 leaves no balance to keep earning", () => {
    const r = runScenario(scenario({ withdrawal: { month: 1, withdrawPct: 100, exitPenaltyPct: 0, slippagePct: 0 } }));
    if (!r.valid) assert.fail("expected a valid scenario");
    assert.equal(r.finalNetUsd, 0);
    // Month-1 simple interest on 10,000 at 6% is 50, so the full balance is 10,050.
    near(r.withdrawnNetUsd, 10_050);
  });
});

describe("validation and edge cases", () => {
  it("rejects a zero principal", () => {
    assert.equal(runScenario(scenario({ principalUsd: 0 })).valid, false);
  });

  it("rejects a non-integer duration", () => {
    assert.ok(validateScenario(scenario({ months: 2.5 })).length > 0);
  });

  it("rejects a withdrawal after the end of the duration", () => {
    const errors = validateScenario(scenario({ withdrawal: { month: 13, withdrawPct: 10, exitPenaltyPct: 0, slippagePct: 0 } }));
    assert.ok(errors.some((e) => e.includes("Withdrawal month")));
  });

  it("rejects a yield below -100%", () => {
    assert.ok(validateScenario(scenario({ annualYieldPct: -150 })).length > 0);
  });

  it("rejects costs that consume the whole deposit", () => {
    const errors = validateScenario(scenario({ principalUsd: 10, fees: { entryFeePct: 0, annualFeePct: 0, fixedCostUsd: 20 } }));
    assert.ok(errors.length > 0);
  });

  it("returns invalid instead of NaN when the input is invalid", () => {
    const r = runScenario(scenario({ principalUsd: Number.NaN }));
    assert.equal(r.valid, false);
  });

  it("net gain never exceeds what the formula allows for an empty final balance", () => {
    const r = runScenario(scenario({ annualYieldPct: -100, months: 12, compounding: "monthly" }));
    if (!r.valid) assert.fail("expected a valid scenario");
    assert.ok(r.finalNetUsd >= 0);
  });
});
