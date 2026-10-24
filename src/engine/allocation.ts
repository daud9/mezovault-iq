/**
 * Smart Allocation: proposes how to split capital across eligible strategies.
 *
 * Constraints are never silently broken:
 *   - the reserve is never invested
 *   - no strategy receives more than maxAllocationPct of total capital
 *   - no strategy receives less than its minimum capital, so it is skipped instead
 *   - amounts are rounded down to cents, so the total never exceeds deployable capital
 *
 * When the constraints leave capital unplaced, the status is "partial" and the
 * unplaced amount is reported. When nothing can be placed, the status is "infeasible".
 * Projected outcomes are illustrative and use each strategy's assumed mid-range yield.
 */
import { isRiskAllowed } from "./matching";
import { scoreYieldQuality } from "./scoring";
import { simpleValue } from "./returns";
import type { RiskTolerance, StrategyProfile } from "./types";

export interface AllocationRequest {
  capitalUsd: number;
  minReserveUsd: number;
  /** Maximum share of total capital for any single strategy, percent. */
  maxAllocationPct: number;
  risk: RiskTolerance;
  eligibleIds: string[];
}

export type AllocationStatus = "ok" | "partial" | "infeasible" | "invalid";

export interface AllocationLine {
  strategyId: string;
  name: string;
  risk: StrategyProfile["risk"];
  qualityScore: number | null;
  coveragePct: number;
  amountUsd: number;
  percentOfCapital: number;
  capUsd: number;
  illustrativeMidYieldPct: number;
  illustrativeOneYearUsd: number;
  reasoning: string;
}

export interface SkippedStrategy {
  strategyId: string;
  name: string;
  reason: string;
}

export interface AllocationResult {
  status: AllocationStatus;
  errors: string[];
  warnings: string[];
  lines: AllocationLine[];
  skipped: SkippedStrategy[];
  reserveUsd: number;
  deployableUsd: number;
  allocatedUsd: number;
  unplacedUsd: number;
  /** Cash kept back: reserve plus any unplaced amount. */
  cashHeldUsd: number;
  /** Largest amount the caps allow across all candidate strategies. */
  capacityUsd: number;
}

export function validateAllocation(req: AllocationRequest): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(req.capitalUsd) || req.capitalUsd <= 0) errors.push("Capital must be a positive amount.");
  if (!Number.isFinite(req.minReserveUsd) || req.minReserveUsd < 0) errors.push("Minimum reserve cannot be negative.");
  if (!Number.isFinite(req.maxAllocationPct) || req.maxAllocationPct <= 0 || req.maxAllocationPct > 100) {
    errors.push("Maximum allocation per strategy must be above 0% and up to 100%.");
  }
  if (Number.isFinite(req.capitalUsd) && Number.isFinite(req.minReserveUsd) && req.minReserveUsd >= req.capitalUsd) {
    errors.push("Minimum reserve must be less than total capital.");
  }
  return errors;
}

export function floorCents(n: number): number {
  return Math.floor(n * 100 + 1e-9) / 100;
}

export function generateAllocation(
  req: AllocationRequest,
  profiles: StrategyProfile[],
): AllocationResult {
  const errors = validateAllocation(req);
  const empty = (status: AllocationStatus, extra: Partial<AllocationResult> = {}): AllocationResult => ({
    status,
    errors,
    warnings: [],
    lines: [],
    skipped: [],
    reserveUsd: Number.isFinite(req.minReserveUsd) ? req.minReserveUsd : 0,
    deployableUsd: 0,
    allocatedUsd: 0,
    unplacedUsd: 0,
    cashHeldUsd: Number.isFinite(req.minReserveUsd) ? req.minReserveUsd : 0,
    capacityUsd: 0,
    ...extra,
  });

  if (errors.length > 0) return empty("invalid");

  const reserveUsd = floorCents(req.minReserveUsd);
  const deployableUsd = floorCents(req.capitalUsd - reserveUsd);
  const capUsd = floorCents(req.capitalUsd * (req.maxAllocationPct / 100));

  const skipped: SkippedStrategy[] = [];
  const candidates: { profile: StrategyProfile; score: number | null; coverage: number }[] = [];

  for (const profile of profiles) {
    if (!req.eligibleIds.includes(profile.id)) {
      continue;
    }
    if (!isRiskAllowed(req.risk, profile.risk)) {
      skipped.push({ strategyId: profile.id, name: profile.name, reason: `${profile.risk} risk is outside your ${req.risk.toLowerCase()} preference.` });
      continue;
    }
    const quality = scoreYieldQuality(profile);
    candidates.push({ profile, score: quality.score, coverage: quality.coveragePct });
  }

  // Highest-evidence strategies first; unknown scores last; id breaks ties.
  candidates.sort((a, b) => {
    const sa = a.score ?? -1;
    const sb = b.score ?? -1;
    if (sa !== sb) return sb - sa;
    return a.profile.id < b.profile.id ? -1 : a.profile.id > b.profile.id ? 1 : 0;
  });

  const capacityUsd = floorCents(candidates.length * capUsd);

  if (candidates.length === 0) {
    const reason = req.eligibleIds.length === 0
      ? "Select at least one eligible strategy."
      : "None of the selected strategies match your risk preference.";
    return empty("infeasible", {
      skipped,
      reserveUsd,
      deployableUsd,
      unplacedUsd: deployableUsd,
      cashHeldUsd: req.capitalUsd,
      capacityUsd: 0,
      warnings: [reason],
    });
  }

  const lines: AllocationLine[] = [];
  let remaining = deployableUsd;

  for (const { profile, score, coverage } of candidates) {
    if (remaining <= 0) {
      skipped.push({ strategyId: profile.id, name: profile.name, reason: "Deployable capital already placed in higher-ranked strategies." });
      continue;
    }
    const amount = floorCents(Math.min(capUsd, remaining));
    if (amount < profile.minCapitalUsd) {
      skipped.push({
        strategyId: profile.id,
        name: profile.name,
        reason: `The $${amount.toLocaleString("en-US")} available here is below this strategy's $${profile.minCapitalUsd.toLocaleString("en-US")} minimum.`,
      });
      continue;
    }

    const [low, high] = profile.illustrativeApy;
    const mid = (low + high) / 2;
    const rank = lines.length + 1;
    const scoreText = score === null ? "no quality score (insufficient evidence)" : `quality score ${score} (${coverage}% evidence coverage)`;
    const capNote = amount >= capUsd ? `capped at ${req.maxAllocationPct}% of capital` : "sized to the remaining deployable capital";

    lines.push({
      strategyId: profile.id,
      name: profile.name,
      risk: profile.risk,
      qualityScore: score,
      coveragePct: coverage,
      amountUsd: amount,
      percentOfCapital: round2((amount / req.capitalUsd) * 100),
      capUsd,
      illustrativeMidYieldPct: mid,
      illustrativeOneYearUsd: round2(simpleValue(amount, mid, 12)),
      reasoning: `Ranked #${rank} with ${scoreText}. Allocated $${amount.toLocaleString("en-US")}, ${capNote}.`,
    });

    remaining = round2(remaining - amount);
  }

  const allocatedUsd = floorCents(lines.reduce((sum, l) => sum + l.amountUsd, 0));
  const unplacedUsd = floorCents(deployableUsd - allocatedUsd);
  const warnings: string[] = [];

  if (lines.length === 0) {
    return empty("infeasible", {
      skipped,
      reserveUsd,
      deployableUsd,
      unplacedUsd: deployableUsd,
      cashHeldUsd: req.capitalUsd,
      capacityUsd,
      warnings: ["No strategy could take an amount above its minimum capital within the cap. Raise the cap, lower the reserve, or add capital."],
    });
  }

  let status: AllocationStatus = "ok";
  if (unplacedUsd > 0.009) {
    status = "partial";
    if (capacityUsd < deployableUsd) {
      warnings.push(
        `The ${req.maxAllocationPct}% cap across ${candidates.length} candidate strategy(ies) allows at most $${capacityUsd.toLocaleString("en-US")}, below the $${deployableUsd.toLocaleString("en-US")} deployable. $${unplacedUsd.toLocaleString("en-US")} stays unplaced rather than breaking the cap.`,
      );
    } else {
      warnings.push(
        `$${unplacedUsd.toLocaleString("en-US")} stays unplaced because the remaining amounts fall below the minimum capital of the candidate strategies.`,
      );
    }
  }
  if (skipped.some((s) => s.reason.includes("minimum"))) {
    warnings.push("Some strategies were skipped because the amount available to them is below their minimum capital.");
  }
  if (lines.some((l) => l.qualityScore === null)) {
    warnings.push("At least one allocation has insufficient evidence for a quality score. Treat its ranking with caution.");
  }

  return {
    status,
    errors: [],
    warnings,
    lines,
    skipped,
    reserveUsd,
    deployableUsd,
    allocatedUsd,
    unplacedUsd,
    cashHeldUsd: round2(req.capitalUsd - allocatedUsd),
    capacityUsd,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

