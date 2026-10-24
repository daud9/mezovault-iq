/**
 * Yield Quality Score (YQS): a deterministic, documented scoring formula.
 *
 * It measures how well-evidenced a strategy is, not how high its yield is.
 *
 * Components (each scored 0-100, or unknown when no evidence exists):
 *   1. Yield-source clarity  (weight 25): clear 100, partial 60, unclear 20
 *   2. Liquidity             (weight 25): <=1 day 100, <=7 days 70, <=14 days 40, >14 days 10
 *   3. Security evidence     (weight 25): verified-audit 100, partial-review 50, none-known 0, unknown = unknown
 *   4. Historical performance(weight 25): the supplied 0-100 value, or unknown
 *
 * Unknown components are excluded from the average, not counted as zero.
 *   score    = sum(weight * value) / sum(weight of known components)
 *   coverage = sum(weight of known components) / sum(all weights) * 100
 *
 * If coverage is below MIN_COVERAGE_PCT the assessment is reported as null
 * (insufficient evidence). Coverage is always shown alongside the assessment.
 *
 * Evidence-adjusted score = sum(weight * value over known components) / sum(all weights).
 * It counts unknown components as zero, so it is the value used for ranking.
 */
import type { StrategyProfile, SecurityStatus, YieldClarity } from "./types";

export const SCORE_WEIGHTS = {
  yieldSourceClarity: 25,
  liquidity: 25,
  security: 25,
  historicalPerformance: 25,
} as const;

export const MIN_COVERAGE_PCT = 50;

export type ScoreComponentKey = keyof typeof SCORE_WEIGHTS;

export interface ScoreComponent {
  key: ScoreComponentKey;
  label: string;
  weight: number;
  /** null means unknown and is excluded from the score. */
  value: number | null;
  reason: string;
}

export interface YieldQualityScore {
  /**
   * Assessment: average over known components only.
   * null when coverage is below MIN_COVERAGE_PCT.
   */
  score: number | null;
  /**
   * Evidence-adjusted score: unknown components contribute zero.
   * Used for ranking so missing information never looks like evidence of safety.
   */
  adjustedScore: number;
  coveragePct: number;
  components: ScoreComponent[];
  /** Human-readable label for the UI. */
  label: "Scored" | "Partial evidence" | "Insufficient evidence";
}

export function clarityValue(clarity: YieldClarity): number {
  switch (clarity) {
    case "clear":
      return 100;
    case "partial":
      return 60;
    case "unclear":
      return 20;
  }
}

export function liquidityValue(days: number | null): number | null {
  if (days === null) return null;
  if (!Number.isFinite(days) || days < 0) return null;
  if (days <= 1) return 100;
  if (days <= 7) return 70;
  if (days <= 14) return 40;
  return 10;
}

export function securityValue(status: SecurityStatus): number | null {
  switch (status) {
    case "verified-audit":
      return 100;
    case "partial-review":
      return 50;
    case "none-known":
      return 0;
    case "unknown":
      return null;
  }
}

export function historicalValue(score: number | null): number | null {
  if (score === null || !Number.isFinite(score)) return null;
  return Math.min(100, Math.max(0, score));
}

export function scoreYieldQuality(profile: StrategyProfile): YieldQualityScore {
  const components: ScoreComponent[] = [
    {
      key: "yieldSourceClarity",
      label: "Yield-source clarity",
      weight: SCORE_WEIGHTS.yieldSourceClarity,
      value: clarityValue(profile.yieldSource.clarity),
      reason: `Documentation rated "${profile.yieldSource.clarity}".`,
    },
    {
      key: "liquidity",
      label: "Liquidity",
      weight: SCORE_WEIGHTS.liquidity,
      value: liquidityValue(profile.liquidityDays),
      reason:
        profile.liquidityDays === null
          ? "Exit time unknown."
          : `Assumed exit time of ${profile.liquidityDays} day(s).`,
    },
    {
      key: "security",
      label: "Security evidence",
      weight: SCORE_WEIGHTS.security,
      value: securityValue(profile.protocol.auditStatus),
      reason:
        profile.protocol.auditStatus === "unknown"
          ? "No audit information supplied. Treated as unknown."
          : `Audit status: ${profile.protocol.auditStatus}.`,
    },
    {
      key: "historicalPerformance",
      label: "Historical performance",
      weight: SCORE_WEIGHTS.historicalPerformance,
      value: historicalValue(profile.historicalPerformanceScore),
      reason:
        profile.historicalPerformanceScore === null
          ? "No verified historical data. Treated as unknown."
          : "Supplied historical score.",
    },
  ];

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const known = components.filter((c): c is ScoreComponent & { value: number } => c.value !== null);
  const knownWeight = known.reduce((sum, c) => sum + c.weight, 0);
  const weighted = known.reduce((sum, c) => sum + c.weight * c.value, 0);
  const coveragePct = round1((knownWeight / totalWeight) * 100);
  // Unknown components count as zero here, so missing evidence lowers the adjusted score.
  const adjustedScore = round1(weighted / totalWeight);

  if (coveragePct < MIN_COVERAGE_PCT || knownWeight === 0) {
    return { score: null, adjustedScore, coveragePct, components, label: "Insufficient evidence" };
  }

  return {
    score: round1(weighted / knownWeight),
    adjustedScore,
    coveragePct,
    components,
    label: coveragePct >= 100 ? "Scored" : "Partial evidence",
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
