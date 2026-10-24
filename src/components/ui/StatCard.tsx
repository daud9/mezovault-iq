import type { ReactNode } from "react";
import { Card } from "./Card";

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  badge?: ReactNode;
}

export function StatCard({ label, value, hint, icon, badge }: StatCardProps) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-mist-500">{label}</span>
        {icon && <span className="text-gold-400">{icon}</span>}
      </div>
      <div className="text-2xl font-semibold tracking-tight text-mist-100">{value}</div>
      <div className="flex flex-wrap items-center gap-2">
        {badge}
        {hint && <span className="text-xs text-mist-400">{hint}</span>}
      </div>
    </Card>
  );
}
