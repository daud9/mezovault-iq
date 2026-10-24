/**
 * Matches strategies against user preferences and explains each result.
 *
 * Hard constraints (capital, risk, horizon, liquidity) decide eligibility.
 * A "conflicts" status on a hard constraint makes a strategy ineligible.
 * An "unknown" status (e.g. no liquidity data) does not exclude a strategy,
 * but the strategy is ranked below fully verified matches.
 * The target yield is soft: it affects ranking but never excludes a strategy.
 */
import type { RiskLevel } from "../types";
import type { RiskTolerance, StrategyProfile } from "./types";
import { scoreYieldQuality, type YieldQualityScore } from "./scoring";

export interface StrategyPreferences {
  capitalUsd: number;
  risk: RiskTolerance;
  horizonMonths: number;
  /** Maximum acceptable exit time in days. null = no requirement. */
  maxExitDays: number | null;
  /** Target annual yield in percent. */
  targetYieldPct: number;
}

export type CheckKey = "capital" | "risk" | "horizon" | "liquidity" | "yield";
export type CheckStatus = "meets" | "conflicts" | "unknown" | "partial";

export interface ConstraintCheck {
  key: CheckKey;
  label: string;
  hard: boolean;
  status: CheckStatus;
  message: string;
}

export interface StrategyMatch {
  profile: StrategyProfile;
  checks: ConstraintCheck[];
  eligible: boolean;
  /** True when a hard constraint could not be verified. */
  hasUnknowns: boolean;
  quality: YieldQualityScore;
  /** 1-based rank after ordering. */
  rank: number;
}

export const RISK_ALLOWANCE: Record<RiskTolerance, RiskLevel[]> = {
  Conservative: ["Low"],
  Moderate: ["Low", "Medium"],
  Aggressive: ["Low", "Medium", "High"],
};

export function isRiskAllowed(tolerance: RiskTolerance, risk: RiskLevel): boolean {
  return RISK_ALLOWANCE[tolerance].includes(risk);
}

export function validatePreferences(p: StrategyPreferences): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(p.capitalUsd) || p.capitalUsd <= 0) errors.push("Capital must be a positive amount.");
  if (!Number.isFinite(p.horizonMonths) || p.horizonMonths < 0 || p.horizonMonths > 360) {
    errors.push("Horizon must be between 0 and 360 months.");
  }
  if (p.maxExitDays !== null && (!Number.isFinite(p.maxExitDays) || p.maxExitDays < 0)) {
    errors.push("Liquidity requirement must be zero days or more.");
  }
  if (!Number.isFinite(p.targetYieldPct) || p.targetYieldPct < 0 || p.targetYieldPct > 100) {
    errors.push("Target yield must be between 0% and 100%.");
  }
  if (!(["Conservative", "Moderate", "Aggressive"] as const).includes(p.risk)) {
    errors.push("Choose a risk tolerance.");
  }
  return errors;
}

export function checkStrategy(profile: StrategyProfile, p: StrategyPreferences): ConstraintCheck[] {
  const checks: ConstraintCheck[] = [];

  checks.push(
    p.capitalUsd >= profile.minCapitalUsd
      ? { key: "capital", label: "Capital", hard: true, status: "meets", message: `Your capital meets the $${profile.minCapitalUsd.toLocaleString("en-US")} minimum.` }
      : { key: "capital", label: "Capital", hard: true, status: "conflicts", message: `Below the $${profile.minCapitalUsd.toLocaleString("en-US")} minimum this strategy is designed for.` },
  );

  checks.push(
    isRiskAllowed(p.risk, profile.risk)
      ? { key: "risk", label: "Risk", hard: true, status: "meets", message: `${profile.risk} risk is within your ${p.risk.toLowerCase()} tolerance.` }
      : { key: "risk", label: "Risk", hard: true, status: "conflicts", message: `${profile.risk} risk is above your ${p.risk.toLowerCase()} tolerance.` },
  );

  checks.push(
    p.horizonMonths >= profile.minHorizonMonths
      ? { key: "horizon", label: "Horizon", hard: true, status: "meets", message: `Your ${p.horizonMonths}-month horizon covers the ${profile.minHorizonMonths}-month minimum.` }
      : { key: "horizon", label: "Horizon", hard: true, status: "conflicts", message: `Needs at least ${profile.minHorizonMonths} months; your horizon is ${p.horizonMonths}.` },
  );

  if (p.maxExitDays === null) {
    checks.push({ key: "liquidity", label: "Liquidity", hard: true, status: "meets", message: "No liquidity requirement set." });
  } else if (profile.liquidityDays === null) {
    checks.push({ key: "liquidity", label: "Liquidity", hard: true, status: "unknown", message: "Exit time is unknown, so the requirement cannot be verified." });
  } else if (profile.liquidityDays <= p.maxExitDays) {
    checks.push({ key: "liquidity", label: "Liquidity", hard: true, status: "meets", message: `Assumed exit of ${profile.liquidityDays} day(s) is within your ${p.maxExitDays}-day limit.` });
  } else {
    checks.push({ key: "liquidity", label: "Liquidity", hard: true, status: "conflicts", message: `Assumed exit of ${profile.liquidityDays} days exceeds your ${p.maxExitDays}-day limit.` });
  }

  const [low, high] = profile.illustrativeApy;
  if (low >= p.targetYieldPct) {
    checks.push({ key: "yield", label: "Target yield", hard: false, status: "meets", message: `Even the low end of the illustrative range (${low}%) meets your ${p.targetYieldPct}% target.` });
  } else if (high >= p.targetYieldPct) {
    checks.push({ key: "yield", label: "Target yield", hard: false, status: "partial", message: `Your ${p.targetYieldPct}% target falls inside the illustrative ${low}–${high}% range. This is not guaranteed.` });
  } else {
    checks.push({ key: "yield", label: "Target yield", hard: false, status: "conflicts", message: `The illustrative range tops out at ${high}%, below your ${p.targetYieldPct}% target.` });
  }

  return checks;
}

const STATUS_RANK: Record<CheckStatus, number> = { meets: 0, partial: 1, unknown: 2, conflicts: 3 };

/**
 * Ranking order:
 *   tier 0: eligible with no unknown hard constraints
 *   tier 1: eligible with unknown hard constraints
 *   tier 2: ineligible
 * Within a tier: better yield-target status first, then the higher evidence-adjusted
 * Yield Quality Score, then the strategy id, so results are deterministic.
 */
export function matchStrategies(profiles: StrategyProfile[], p: StrategyPreferences): StrategyMatch[] {
  const matches = profiles.map((profile) => {
    const checks = checkStrategy(profile, p);
    const eligible = checks.every((c) => !c.hard || c.status !== "conflicts");
    const hasUnknowns = checks.some((c) => c.hard && c.status === "unknown");
    return {
      profile,
      checks,
      eligible,
      hasUnknowns,
      quality: scoreYieldQuality(profile),
      rank: 0,
    };
  });

  const tier = (m: StrategyMatch) => (!m.eligible ? 2 : m.hasUnknowns ? 1 : 0);
  const yieldStatus = (m: StrategyMatch) => STATUS_RANK[m.checks.find((c) => c.key === "yield")?.status ?? "conflicts"];

  matches.sort((a, b) => {
    if (tier(a) !== tier(b)) return tier(a) - tier(b);
    if (yieldStatus(a) !== yieldStatus(b)) return yieldStatus(a) - yieldStatus(b);
    if (a.quality.adjustedScore !== b.quality.adjustedScore) {
      return b.quality.adjustedScore - a.quality.adjustedScore;
    }
    return a.profile.id < b.profile.id ? -1 : a.profile.id > b.profile.id ? 1 : 0;
  });

  return matches.map((m, i) => ({ ...m, rank: i + 1 }));
}
