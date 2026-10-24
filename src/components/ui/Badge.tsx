import type { ReactNode } from "react";
import type { RiskLevel } from "../../types";

const riskStyles: Record<RiskLevel, string> = {
  Low: "text-risk-low border-risk-low/30 bg-risk-low/10",
  Medium: "text-risk-medium border-risk-medium/30 bg-risk-medium/10",
  High: "text-risk-high border-risk-high/30 bg-risk-high/10",
};

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${riskStyles[risk]}`}>
      {risk} risk
    </span>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "gold" }) {
  const styles =
    tone === "gold"
      ? "border-gold-500/40 bg-gold-500/10 text-gold-300"
      : "border-line bg-ink-800 text-mist-300";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles}`}>
      {children}
    </span>
  );
}
