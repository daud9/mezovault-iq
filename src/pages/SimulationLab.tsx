import { useMemo, useState } from "react";
import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DemoLabel } from "../components/ui/DemoLabel";
import { formatUsd } from "../lib/format";

const HORIZONS = [12, 24, 36] as const;

export function SimulationLab() {
  const [principal, setPrincipal] = useState(10_000);
  const [apy, setApy] = useState(6);

  const rows = useMemo(
    () =>
      HORIZONS.map((months) => {
        const r = apy / 100 / 12;
        const value = principal * Math.pow(1 + r, months);
        return { months, value, gain: value - principal };
      }),
    [principal, apy],
  );

  const max = Math.max(...rows.map((r) => r.value));

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Simulation Lab"
        title="Project hypothetical outcomes"
        description="Monthly-compounded projections from your own assumptions. Results are hypothetical and do not reflect any real strategy."
        actions={<DemoLabel note="Hypothetical" />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card className="space-y-6">
          <div>
            <label htmlFor="principal" className="flex items-center justify-between text-sm font-medium text-mist-100">
              Starting amount <span className="text-gold-300">{formatUsd(principal)}</span>
            </label>
            <input
              id="principal"
              type="range"
              min={1000}
              max={100000}
              step={1000}
              value={principal}
              onChange={(e) => setPrincipal(Number(e.target.value))}
              className="mt-3 w-full accent-[var(--color-gold-400)]"
            />
          </div>
          <div>
            <label htmlFor="apy" className="flex items-center justify-between text-sm font-medium text-mist-100">
              Assumed annual yield <span className="text-gold-300">{apy}%</span>
            </label>
            <input
              id="apy"
              type="range"
              min={0}
              max={20}
              step={0.5}
              value={apy}
              onChange={(e) => setApy(Number(e.target.value))}
              className="mt-3 w-full accent-[var(--color-gold-400)]"
            />
            <p className="mt-3 text-xs leading-relaxed text-mist-500">
              This is an assumption you set. Real yields vary and can fall to zero or below, through losses.
            </p>
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-mist-100">Projected value</h2>
          <div className="mt-6 space-y-5">
            {rows.map((r) => (
              <div key={r.months}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-mist-400">{r.months} months</span>
                  <span className="font-semibold text-mist-100">
                    {formatUsd(r.value)}
                    <span className="ml-2 text-xs font-normal text-mist-500">+{formatUsd(r.gain)}</span>
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-700">
                  <div className="h-full rounded-full bg-gradient-to-r from-gold-300 to-gold-500 transition-all duration-500" style={{ width: `${(r.value / max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 border-t border-line pt-4 text-xs text-mist-500">
            Stage 1 projections are local arithmetic only. Scenario stress tests (rate shocks, depegs, liquidations) arrive in Stage 2.
          </p>
        </Card>
      </div>
    </div>
  );
}
