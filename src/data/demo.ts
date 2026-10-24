/**
 * DEMONSTRATION DATA ONLY.
 * Nothing in this file is live market data, a real balance, or a real transaction.
 * Every consumer must display it behind a DemoLabel.
 */
import type { AllocationBucket, Strategy, VaultMetric } from "../types";

export const DEMO_PORTFOLIO_VALUE_USD = 25_000;

export const DEMO_STRATEGIES: Strategy[] = [
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

export const DEMO_ALLOCATION: AllocationBucket[] = [
  {
    id: "stable",
    label: "Stable yield",
    description: "Single-asset MUSD vault strategies",
    percent: 40,
    risk: "Low",
  },
  {
    id: "lending",
    label: "Collateral lending",
    description: "MUSD lending against approved collateral",
    percent: 30,
    risk: "Medium",
  },
  {
    id: "liquidity",
    label: "Liquidity pools",
    description: "MUSD/MEZO pairs; impermanent loss applies",
    percent: 20,
    risk: "Medium",
  },
  {
    id: "reserve",
    label: "Reserve",
    description: "Kept uninvested for flexibility",
    percent: 10,
    risk: "Low",
  },
];

export const DEMO_VAULT_METRICS: VaultMetric[] = [
  {
    id: "tvl",
    name: "Total value locked",
    value: "Not connected",
    explanation: "Requires an on-chain indexer, which is not connected in Stage 1.",
  },
  {
    id: "utilisation",
    name: "Utilisation",
    value: "Not connected",
    explanation: "Share of supplied liquidity currently borrowed.",
  },
  {
    id: "health",
    name: "Risk score",
    value: "Not connected",
    explanation: "Composite of contract audit status, collateral quality and concentration.",
  },
];
