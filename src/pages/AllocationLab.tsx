import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Info, XCircle } from "lucide-react";
import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DemoLabel } from "../components/ui/DemoLabel";
import { RiskBadge } from "../components/ui/Badge";
import { ChoiceGroup } from "../components/forms/ChoiceGroup";
import { NumberField } from "../components/forms/NumberField";
import { FormErrors } from "../components/forms/FormErrors";
import { formatUsdCents } from "../lib/format";
import { STRATEGY_PROFILES } from "../engine/catalog";
import { generateAllocation, validateAllocation, type AllocationRequest, type AllocationStatus } from "../engine/allocation";
import type { RiskTolerance } from "../engine/types";

const RISK_OPTIONS: { value: RiskTolerance; label: string }[] = [
  { value: "Conservative", label: "Conservative" },
  { value: "Moderate", label: "Moderate" },
  { value: "Aggressive", label: "Aggressive" },
];

const STATUS_BANNER: Record<AllocationStatus, { title: string; cls: string; Icon: typeof CheckCircle2 }> = {
  ok: { title: "Allocation fits every constraint", cls: "border-risk-low/40 bg-risk-low/10 text-risk-low", Icon: CheckCircle2 },
  partial: { title: "Partial allocation: some capital cannot be placed within the caps", cls: "border-risk-medium/40 bg-risk-medium/10 text-risk-medium", Icon: AlertCircle },
  infeasible: { title: "Infeasible: no allocation satisfies these constraints", cls: "border-risk-high/40 bg-risk-high/10 text-risk-high", Icon: XCircle },
  invalid: { title: "Check your inputs", cls: "border-line bg-ink-800 text-mist-300", Icon: Info },
};

export function AllocationLab() {
  const [capitalUsd, setCapitalUsd] = useState(10_000);
  const [minReserveUsd, setMinReserveUsd] = useState(1_000);
  const [maxAllocationPct, setMaxAllocationPct] = useState(30);
  const [risk, setRisk] = useState<RiskTolerance>("Moderate");
  const [eligibleIds, setEligibleIds] = useState<string[]>(() => STRATEGY_PROFILES.map((p) => p.id));

  const request: AllocationRequest = { capitalUsd, minReserveUsd, maxAllocationPct, risk, eligibleIds };
  const inputErrors = validateAllocation(request);
  const result = inputErrors.length === 0 ? generateAllocation(request, STRATEGY_PROFILES) : null;

  const toggle = (id: string) =>
    setEligibleIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const banner = result ? STATUS_BANNER[result.status] : STATUS_BANNER.invalid;
  const fmt = formatUsdCents;

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Smart Allocation Lab"
        title="Propose a constrained allocation"
        description="Set your capital, reserve, per-strategy cap, risk preference and eligible strategies. The lab fills the highest-ranked strategies first and never breaks a constraint. If it can't, it says so."
        actions={<DemoLabel note="Planning only" />}
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit space-y-6">
          <h2 className="text-sm font-semibold text-mist-100">Constraints</h2>

          <NumberField id="alloc-capital" label="Capital available" value={capitalUsd} onChange={setCapitalUsd} min={0} step={100} suffix="USD" />
          <NumberField id="alloc-reserve" label="Minimum liquid reserve" value={minReserveUsd} onChange={setMinReserveUsd} min={0} step={100} suffix="USD" hint="Kept uninvested in every outcome." />
          <NumberField id="alloc-cap" label="Maximum per strategy" value={maxAllocationPct} onChange={setMaxAllocationPct} min={0} max={100} step={5} suffix="% of capital" />
          <ChoiceGroup label="Risk preference" value={risk} options={RISK_OPTIONS} onChange={setRisk} />

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-mist-100">Eligible strategies</legend>
            {STRATEGY_PROFILES.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-ink-800/60 px-3 py-2.5 text-sm text-mist-200 hover:border-gold-500/40">
                <span className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={eligibleIds.includes(p.id)}
                    onChange={() => toggle(p.id)}
                    className="h-4 w-4 accent-[var(--color-gold-400)]"
                  />
                  {p.name}
                </span>
                <RiskBadge risk={p.risk} />
              </label>
            ))}
          </fieldset>

          <FormErrors errors={inputErrors} />
        </Card>

        <div className="space-y-6">
          <div role="status" className={`flex items-start gap-3 rounded-2xl border p-5 ${banner.cls}`}>
            <banner.Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">{banner.title}</p>
              {result && result.status !== "invalid" && (
                <p className="mt-1 text-sm opacity-90">
                  Deployable {fmt(result.deployableUsd)} · Allocated {fmt(result.allocatedUsd)} · Unplaced {fmt(result.unplacedUsd)}
                </p>
              )}
            </div>
          </div>

          {result && result.warnings.length > 0 && (
            <Card className="space-y-2 border-risk-medium/30 text-sm text-mist-300">
              <p className="font-medium text-mist-100">Constraint notes</p>
              <ul className="list-disc space-y-1.5 pl-5">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Card>
          )}

          {result && result.lines.length > 0 && (
            <Card className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-mist-100">Proposed allocation</h2>
                <DemoLabel note="Illustrative projection" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-xs text-mist-500">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Strategy</th>
                      <th className="py-2 pr-3 font-medium">Amount</th>
                      <th className="py-2 pr-3 font-medium">Share</th>
                      <th className="py-2 pr-3 font-medium">Cap</th>
                      <th className="py-2 pr-3 font-medium">Quality</th>
                      <th className="py-2 font-medium">Illustrative 12-mo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.lines.map((l) => (
                      <tr key={l.strategyId} className="border-t border-line align-top">
                        <td className="py-3 pr-3">
                          <p className="font-medium text-mist-100">{l.name}</p>
                          <p className="text-xs text-mist-500">{l.risk} risk</p>
                        </td>
                        <td className="py-3 pr-3 text-mist-100">{fmt(l.amountUsd)}</td>
                        <td className="py-3 pr-3 text-mist-300">{l.percentOfCapital}%</td>
                        <td className="py-3 pr-3 text-mist-400">{fmt(l.capUsd)}</td>
                        <td className="py-3 pr-3 text-mist-300">{l.qualityScore === null ? "Unknown" : l.qualityScore.toFixed(1)}</td>
                        <td className="py-3 text-mist-400">{fmt(l.illustrativeOneYearUsd)} <span className="text-xs text-mist-500">at {l.illustrativeMidYieldPct}%</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 border-t border-line pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gold-400">Reasoning</p>
                {result.lines.map((l) => (
                  <p key={l.strategyId} className="text-sm leading-relaxed text-mist-400">
                    <span className="text-mist-200">{l.name}:</span> {l.reasoning}
                  </p>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm sm:grid-cols-4">
                <div><p className="text-xs text-mist-500">Reserve kept</p><p className="text-mist-100">{fmt(result.reserveUsd)}</p></div>
                <div><p className="text-xs text-mist-500">Allocated</p><p className="text-mist-100">{fmt(result.allocatedUsd)}</p></div>
                <div><p className="text-xs text-mist-500">Unplaced</p><p className="text-mist-100">{fmt(result.unplacedUsd)}</p></div>
                <div><p className="text-xs text-mist-500">Cash held in total</p><p className="text-mist-100">{fmt(result.cashHeldUsd)}</p></div>
              </div>
            </Card>
          )}

          {result && result.skipped.length > 0 && (
            <Card className="space-y-3 text-sm">
              <p className="font-medium text-mist-100">Not allocated</p>
              <ul className="space-y-2 text-mist-400">
                {result.skipped.map((s) => (
                  <li key={s.strategyId}><span className="text-mist-200">{s.name}:</span> {s.reason}</li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="space-y-2 text-sm leading-relaxed text-mist-400">
            <p className="font-medium text-mist-200">What this does and doesn't do</p>
            <p>
              The lab proposes weights from your constraints and the Yield Quality Score. It does not check balances, place orders, or move funds.
              Illustrative projections use each strategy's assumed mid-range yield and are not forecasts.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
