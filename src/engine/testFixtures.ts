/**
 * TEST FIXTURES ONLY. These strategies are illustrative and are not verified
 * protocols. They must never be imported by application code.
 *
 * DEMONSTRATION DATA. Every entry is a concept. No audits, TVL, live APYs or
 * protocol addresses are verified here, so those fields are recorded as unknown.
 * Liquidity days and minimums are design assumptions, not measured values.
 */
import type { Strategy } from "../types";

const DEMO_STRATEGIES: Strategy[] = [
  {
    id: "musd-stable-vault",
    name: "MUSD Stable Vault",
    category: "Yield vault",
    risk: "Low",
    summary: "Concept: earn yield on MUSD held in a single-asset vault with conservative parameters.",
    illustrativeApy: [3, 6],
    assets: ["MUSD"],
  },
  {
    id: "musd-collateral-lending",
    name: "MUSD Collateral Lending",
    category: "Lending",
    risk: "Medium",
    summary: "Concept: lend MUSD against approved collateral with utilisation-based rates.",
    illustrativeApy: [5, 9],
    assets: ["MUSD"],
  },
  {
    id: "liquidity-pool-balanced",
    name: "Balanced Liquidity Pool",
    category: "Liquidity",
    risk: "Medium",
    summary: "Concept: provide MUSD/MEZO liquidity and earn trading fees, exposed to impermanent loss.",
    illustrativeApy: [6, 11],
    assets: ["MUSD", "MEZO"],
  },
  {
    id: "mezo-staking-derivative",
    name: "MEZO Staking Derivative",
    category: "Staking",
    risk: "High",
    summary: "Concept: a liquid receipt token representing staked MEZO, adding smart-contract and token risk.",
    illustrativeApy: [8, 14],
    assets: ["MEZO"],
  },
  {
    id: "looping-strategy",
    name: "Leveraged Looping",
    category: "Looping",
    risk: "High",
    summary: "Concept: repeated borrow-and-supply cycles that amplify both yield and liquidation risk.",
    illustrativeApy: [10, 20],
    assets: ["MUSD", "MEZO"],
  },
];
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

export const FIXTURE_PROFILES: StrategyProfile[] = DEMO_STRATEGIES.map((strategy) => {
  const extras = EXTRAS[strategy.id];
  if (!extras) {
    throw new Error(`No profile data for demonstration strategy "${strategy.id}"`);
  }
  return { ...strategy, ...extras };
});

