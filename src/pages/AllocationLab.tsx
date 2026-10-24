import { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DemoLabel } from "../components/ui/DemoLabel";
import { Button } from "../components/ui/Button";
import { DEMO_ALLOCATION } from "../data/demo";
import { RiskBadge } from "../components/ui/Badge";
import type { RiskLevel } from "../types";

const RISK_SCORE: Record<RiskLevel, number> = { Low: 1, Medium: 2, High: 3 };

export function AllocationLab() {
  const [weights, setWeights] = useState<Record<string, number>>(
    () => Object.fromEntries(DEMO_ALLOCATION.map((b) => [b.id, b.percent])),
  );

  const total = useMemo(() => Object.values(weights).reduce((a, b) => a + b, 0), [weights]);
  const valid = total === 100;

  const weightedRisk = useMemo(() => {
    if (!valid) return null;
    const score = DEMO_ALLOCATION.reduce((a, b) => a + (weights[b.id] / 100) * RISK_SCORE[b.risk], 0);
    return score < 1.5 ? "Low" : score < 2.3 ? "Medium" : "High";
  }, [weights, valid]);

  const update = (id: string, value: number) => setWeights((w) => ({ ...w, [id]: value }));
  const reset = () => setWeights(Object.fromEntries(DEMO_ALLOCATION.map((b) => [b.id, b.percent])));

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Allocation Lab"
        title="Shape a target allocation"
        description="Adjust target weights to see the blended risk profile. This is a local planning tool: it does not move funds."
        actions={<DemoLabel note="Local only" />}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="space-y-6">
          {DEMO_ALLOCATION.map((b) => (
            <div key={b.id}>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={`w-${b.id}`} className="min-w-0">
                  <span className="block text-sm font-medium text-mist-100">{b.label}</span>
                  <span className="block truncate text-xs text-mist-500">{b.description}</span>
                </label>
                <span className="w-12 text-right text-sm font-semibold text-gold-300">{weights[b.id]}%</span>
              </div>
              <input
                id={`w-${b.id}`}
                type="range"
                min={0}
                max={100}
                step={5}
                value={weights[b.id]}
                onChange={(e) => update(b.id, Number(e.target.value))}
                className="mt-3 w-full accent-[var(--color-gold-400)]"
              />
            </div>
          ))}

          <div className="flex items-center justify-between border-t border-line pt-5">
            <span className="text-sm text-mist-400">
              Total <span className={valid ? "text-mist-100" : "text-risk-high"}>{total}%</span>
            </span>
            <Button variant="ghost" onClick={reset}>Reset to demo</Button>
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-mist-100">Blended profile</h2>
          {valid ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-mist-400">Overall risk</span>
                <RiskBadge risk={weightedRisk ?? "Medium"} />
              </div>
              <p className="text-sm leading-relaxed text-mist-400">
                Blended from the risk tier of each bucket. It is a rough planning signal, not a risk model.
              </p>
            </>
          ) : (
            <div role="alert" className="flex gap-2 rounded-xl border border-risk-high/30 bg-risk-high/10 p-4 text-sm text-mist-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-risk-high" aria-hidden="true" />
              Weights must total 100% before a profile can be calculated.
            </div>
          )}
          <p className="mt-auto border-t border-line pt-4 text-xs leading-relaxed text-mist-500">
            Allocations here are not saved, submitted or executed. Autopilot and on-chain execution arrive in later stages.
          </p>
        </Card>
      </div>
    </div>
  );
}
