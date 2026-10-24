import type { RiskLevel, Strategy } from "../types";

export type RiskTolerance = "Conservative" | "Moderate" | "Aggressive";

/** Documented, deliberately conservative status values. "unknown" means no evidence was supplied. */
export type SecurityStatus = "verified-audit" | "partial-review" | "none-known" | "unknown";

export type YieldClarity = "clear" | "partial" | "unclear";

export interface StrategyProfile extends Strategy {
  /** Smallest deposit the strategy is designed for, in USD. */
  minCapitalUsd: number;
  /** Shortest horizon the strategy is designed for, in months. */
  minHorizonMonths: number;
  /** Days needed to exit a full position under normal conditions. null = unknown. */
  liquidityDays: number | null;
  liquidityNote: string;
  yieldSource: {
    description: string;
    clarity: YieldClarity;
  };
  protocol: {
    name: string;
    network: string;
    /** Never populated in this build: no verified contract addresses are available. */
    contractAddress: null;
    auditStatus: SecurityStatus;
    auditReference: null;
  };
  /** Historical performance score 0-100 from a verified data source. null = unknown. */
  historicalPerformanceScore: number | null;
  dataSource: {
    label: string;
    freshness: string;
  };
}

export type { RiskLevel };
