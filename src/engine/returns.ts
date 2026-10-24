/**
 * Deterministic return and scenario calculations.
 * All results are hypothetical projections from user-entered assumptions.
 * Nothing here is a live yield, a guarantee, or a transaction.
 */

export type CompoundingMode = "simple" | "monthly";

export interface FeeSettings {
  /** One-off fee on the deposit, percent of principal. */
  entryFeePct: number;
  /** Annual fee deducted from the yield, percentage points. */
  annualFeePct: number;
  /** Fixed cost per transaction in USD. Counted for the deposit, the final exit, and each partial withdrawal. */
  fixedCostUsd: number;
}

export interface WithdrawalStress {
  /** Month (1-based) in which a partial withdrawal is forced. */
  month: number;
  /** Percent of the current balance withdrawn. */
  withdrawPct: number;
  /** Penalty charged by the strategy for early exit, percent of the withdrawn amount. */
  exitPenaltyPct: number;
  /** Price impact or slippage on the withdrawn amount, percent. */
  slippagePct: number;
}

export interface ScenarioInput {
  principalUsd: number;
  /** Advertised or assumed annual yield, percent. */
  annualYieldPct: number;
  months: number;
  compounding: CompoundingMode;
  fees: FeeSettings;
  /** Relative reduction of the yield, percent. 0 = no decline, 50 = half the yield. */
  yieldDeclinePct: number;
  withdrawal: WithdrawalStress | null;
}

export interface ScenarioResult {
  valid: true;
  effectiveAnnualYieldPct: number;
  entryNetUsd: number;
  withdrawnNetUsd: number;
  finalNetUsd: number;
  totalValueUsd: number;
  totalCostsUsd: number;
  netGainUsd: number;
  netReturnPct: number;
  transactions: number;
}

export interface ScenarioInvalid {
  valid: false;
  errors: string[];
}

export type ScenarioOutcome = ScenarioResult | ScenarioInvalid;

export function validateScenario(s: ScenarioInput): string[] {
  const errors: string[] = [];
  const finite = (n: number) => Number.isFinite(n);

  if (!finite(s.principalUsd) || s.principalUsd <= 0) errors.push("Starting amount must be greater than zero.");
  if (!finite(s.months) || !Number.isInteger(s.months) || s.months < 1 || s.months > 360) {
    errors.push("Duration must be a whole number of months from 1 to 360.");
  }
  if (!finite(s.annualYieldPct) || s.annualYieldPct < -100 || s.annualYieldPct > 100) {
    errors.push("Annual yield must be between -100% and 100%.");
  }
  if (!finite(s.fees.entryFeePct) || s.fees.entryFeePct < 0 || s.fees.entryFeePct > 100) {
    errors.push("Entry fee must be between 0% and 100%.");
  }
  if (!finite(s.fees.annualFeePct) || s.fees.annualFeePct < 0 || s.fees.annualFeePct > 100) {
    errors.push("Annual fee must be between 0% and 100%.");
  }
  if (!finite(s.fees.fixedCostUsd) || s.fees.fixedCostUsd < 0) errors.push("Fixed cost cannot be negative.");
  if (!finite(s.yieldDeclinePct) || s.yieldDeclinePct < 0 || s.yieldDeclinePct > 100) {
    errors.push("Yield decline must be between 0% and 100%.");
  }

  if (s.withdrawal) {
    const w = s.withdrawal;
    if (!Number.isInteger(w.month) || w.month < 1 || w.month > s.months) {
      errors.push("Withdrawal month must be a whole month within the duration.");
    }
    if (!finite(w.withdrawPct) || w.withdrawPct <= 0 || w.withdrawPct > 100) {
      errors.push("Withdrawal share must be above 0% and up to 100%.");
    }
    if (!finite(w.exitPenaltyPct) || w.exitPenaltyPct < 0 || w.exitPenaltyPct > 100) {
      errors.push("Exit penalty must be between 0% and 100%.");
    }
    if (!finite(w.slippagePct) || w.slippagePct < 0 || w.slippagePct > 100) {
      errors.push("Slippage must be between 0% and 100%.");
    }
  }

  if (errors.length === 0) {
    const entryNet = s.principalUsd * (1 - s.fees.entryFeePct / 100) - s.fees.fixedCostUsd;
    if (entryNet <= 0) errors.push("Entry fees and fixed costs leave nothing to invest.");
  }

  return errors;
}

/**
 * Runs one scenario month by month.
 * Monthly rate = (effective yield - annual fee) / 12, applied as simple interest on
 * the invested base (simple mode) or compounded on the running balance (monthly mode).
 */
export function runScenario(s: ScenarioInput): ScenarioOutcome {
  const errors = validateScenario(s);
  if (errors.length > 0) return { valid: false, errors };

  const effectiveAnnualYieldPct = s.annualYieldPct * (1 - s.yieldDeclinePct / 100);
  const netAnnualPct = effectiveAnnualYieldPct - s.fees.annualFeePct;
  const monthlyRate = netAnnualPct / 100 / 12;

  const entryFee = s.principalUsd * (s.fees.entryFeePct / 100);
  const entryNetUsd = s.principalUsd - entryFee - s.fees.fixedCostUsd;

  let base = entryNetUsd;
  let balance = entryNetUsd;
  let withdrawnNetUsd = 0;
  let withdrawalCosts = 0;
  let transactions = 2;

  for (let month = 1; month <= s.months; month++) {
    if (s.compounding === "monthly") {
      balance = balance * (1 + monthlyRate);
    } else {
      balance = balance + base * monthlyRate;
    }

    if (s.withdrawal && month === s.withdrawal.month) {
      const w = s.withdrawal;
      const gross = balance * (w.withdrawPct / 100);
      const penalty = gross * (w.exitPenaltyPct / 100);
      const slippage = gross * (w.slippagePct / 100);
      const net = gross - penalty - slippage - s.fees.fixedCostUsd;
      withdrawnNetUsd += Math.max(0, net);
      withdrawalCosts += penalty + slippage + s.fees.fixedCostUsd;
      balance -= gross;
      base -= base * (w.withdrawPct / 100);
      transactions += 1;
    }
  }

  const finalGross = Math.max(0, balance);
  const finalNetUsd = Math.max(0, finalGross - s.fees.fixedCostUsd);
  const totalValueUsd = withdrawnNetUsd + finalNetUsd;
  // Direct costs: deposit fee, fixed cost for the deposit and the final exit, and
  // penalties, slippage and fixed cost for each partial withdrawal.
  // Annual fees reduce the growing balance, so they appear in the outcome, not here.
  const totalCostsUsd = entryFee + s.fees.fixedCostUsd * 2 + withdrawalCosts;

  const netGainUsd = totalValueUsd - s.principalUsd;

  return {
    valid: true,
    effectiveAnnualYieldPct: round2(effectiveAnnualYieldPct),
    entryNetUsd: round2(entryNetUsd),
    withdrawnNetUsd: round2(withdrawnNetUsd),
    finalNetUsd: round2(finalNetUsd),
    totalValueUsd: round2(totalValueUsd),
    totalCostsUsd: round2(Math.max(0, totalCostsUsd)),
    netGainUsd: round2(netGainUsd),
    netReturnPct: round2((netGainUsd / s.principalUsd) * 100),
    transactions,
  };
}

/** Closed-form simple return: P * (1 + r * months / 12). Used for reference and tests. */
export function simpleValue(principal: number, annualPct: number, months: number): number {
  return principal * (1 + (annualPct / 100) * (months / 12));
}

/** Closed-form monthly-compounded value: P * (1 + r / 12) ^ months. */
export function compoundValue(principal: number, annualPct: number, months: number): number {
  return principal * Math.pow(1 + annualPct / 100 / 12, months);
}

export interface StressComparison {
  baseline: ScenarioOutcome;
  stressed: ScenarioOutcome;
  differenceUsd: number | null;
  differencePct: number | null;
}

/** Baseline uses no decline and no forced withdrawal. Stressed applies the user's stress settings. */
export function compareStress(s: ScenarioInput): StressComparison {
  const baseline = runScenario({ ...s, yieldDeclinePct: 0, withdrawal: null });
  const stressed = runScenario(s);
  if (!baseline.valid || !stressed.valid) {
    return { baseline, stressed, differenceUsd: null, differencePct: null };
  }
  const differenceUsd = round2(stressed.totalValueUsd - baseline.totalValueUsd);
  const differencePct = baseline.totalValueUsd === 0 ? null : round2((differenceUsd / baseline.totalValueUsd) * 100);
  return { baseline, stressed, differenceUsd, differencePct };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
