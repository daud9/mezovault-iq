/**
 * Strategy catalogue for the IQ Strategy Engine.
 *
 * DEMONSTRATION DATA. Every entry is a concept. No audits, TVL, live APYs or
 * protocol addresses are verified here, so those fields are recorded as unknown.
 * Liquidity days and minimums are design assumptions, not measured values.
 */
import { DEMO_STRATEGIES } from "../data/demo";
import type { StrategyProfile } from "./types";

type Extras = Omit<StrategyProfile, keyof import("../types").Strategy>;

const DEMO_SOURCE = {
  label: "Demonstration catalogue (static, no live feed)",
  freshness: "Not applicable: static demonstration entry",
};

const EXTRAS: Record<string, Extras> = {
  "musd-stable-vault": {
    minCapitalUsd: 100,
    minHorizonMonths: 0,
    liquidityDays: 1,
    liquidityNote: "Assumed next-day withdrawal. Not verified against a live contract.",
    yieldSource: {
      description: "Interest from the vault's deployed MUSD strategy. The exact source is not documented in this build.",
      clarity: "partial",
    },
    protocol: { name: "Not identified in this build", network: "Mezo (concept)", contractAddress: null, auditStatus: "unknown", auditReference: null },
    historicalPerformanceScore: null,
    dataSource: DEMO_SOURCE,
  },
  "musd-collateral-lending": {
    minCapitalUsd: 500,
    minHorizonMonths: 0,
    liquidityDays: 7,
    liquidityNote: "Assumed seven-day exit window while loans are repaid. Not verified.",
    yieldSource: {
      description: "Interest paid by borrowers who post approved collateral to borrow MUSD. Rates would move with utilisation.",
      clarity: "clear",
    },
    protocol: { name: "Not identified in this build", network: "Mezo (concept)", contractAddress: null, auditStatus: "unknown", auditReference: null },
    historicalPerformanceScore: null,
    dataSource: DEMO_SOURCE,
  },
  "liquidity-pool-balanced": {
    minCapitalUsd: 1000,
    minHorizonMonths: 6,
    liquidityDays: 1,
    liquidityNote: "Assumed next-day exit, but pool depth could widen slippage. Not verified.",
    yieldSource: {
      description: "Trading fees earned by providing MUSD/MEZO liquidity. Exposed to impermanent loss when prices diverge.",
      clarity: "clear",
    },
    protocol: { name: "Not identified in this build", network: "Mezo (concept)", contractAddress: null, auditStatus: "unknown", auditReference: null },
    historicalPerformanceScore: null,
    dataSource: DEMO_SOURCE,
  },
  "mezo-staking-derivative": {
    minCapitalUsd: 500,
    minHorizonMonths: 3,
    liquidityDays: 14,
    liquidityNote: "Assumed two-week exit through the receipt token. Secondary-market depth is unknown.",
    yieldSource: {
      description: "Rewards from staking MEZO, passed through a receipt token. The reward mechanism is not documented in this build.",
      clarity: "partial",
    },
    protocol: { name: "Not identified in this build", network: "Mezo (concept)", contractAddress: null, auditStatus: "unknown", auditReference: null },
    historicalPerformanceScore: null,
    dataSource: DEMO_SOURCE,
  },
  "looping-strategy": {
    minCapitalUsd: 2000,
    minHorizonMonths: 3,
    liquidityDays: 3,
    liquidityNote: "Assumed three-day unwind. Liquidation risk can force faster exits in volatile markets.",
    yieldSource: {
      description: "Repeated borrow-and-supply cycles that amplify exposure. Yield depends on borrow costs and liquidation thresholds that are not verified here.",
      clarity: "partial",
    },
    protocol: { name: "Not identified in this build", network: "Mezo (concept)", contractAddress: null, auditStatus: "unknown", auditReference: null },
    historicalPerformanceScore: null,
    dataSource: DEMO_SOURCE,
  },
};

export const STRATEGY_PROFILES: StrategyProfile[] = DEMO_STRATEGIES.map((strategy) => {
  const extras = EXTRAS[strategy.id];
  if (!extras) {
    throw new Error(`No profile data for demonstration strategy "${strategy.id}"`);
  }
  return { ...strategy, ...extras };
});

export function getProfile(id: string): StrategyProfile | undefined {
  return STRATEGY_PROFILES.find((p) => p.id === id);
}
