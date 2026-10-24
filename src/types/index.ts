export type RiskLevel = "Low" | "Medium" | "High";

export interface Strategy {
  id: string;
  name: string;
  category: string;
  risk: RiskLevel;
  summary: string;
  /** Illustrative APY band only. Not a live or historical rate. */
  illustrativeApy: [number, number];
  assets: string[];
}

export interface AllocationBucket {
  id: string;
  label: string;
  description: string;
  percent: number;
  risk: RiskLevel;
}

export interface VaultMetric {
  id: string;
  name: string;
  value: string;
  explanation: string;
}
