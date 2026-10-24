import { useMemo, useState } from "react";
import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DemoLabel } from "../components/ui/DemoLabel";
import { ChoiceGroup } from "../components/forms/ChoiceGroup";
import { NumberField } from "../components/forms/NumberField";
import { FormErrors } from "../components/forms/FormErrors";
import { formatUsd, formatUsdCents } from "../lib/format";
import {
  compareStress,
  compoundValue,
  runScenario,
  simpleValue,
  validateScenario,
  type CompoundingMode,
  type ScenarioInput,
} from "../engine/returns";

const COMPOUND_OPTIONS: { value: CompoundingMode; label: string }[] = [
  { value: "simple", label: "Simple" },
  { value: "monthly", label: "Monthly compounding" },
];

const DECLINE_LEVELS = [0, 25, 50, 100];

interface Form {
  principalUsd: number;
  annualYieldPct: number;
  months: number;
  compounding: CompoundingMode;
  entryFeePct: number;
  annualFeePct: number;
  fixedCostUsd: number;
  yieldDeclinePct: number;
  withdrawalOn: boolean;
  withdrawMonth: number;
  withdrawPct: number;
  exitPenaltyPct: number;
  slippagePct: number;
}

const DEFAULTS: Form = {
  principalUsd: 10_000,
  annualYieldPct: 6,
  months: 12,
  compounding: "monthly",
  entryFeePct: 0,
  annualFeePct: 0,
  fixedCostUsd: 0,
  yieldDeclinePct: 0,
  withdrawalOn: false,
  withdrawMonth: 6,
  withdrawPct: 50,
  exitPenaltyPct: 2,
  slippagePct: 1,
};

function toScenario(f: Form, stressed: boolean): ScenarioInput {
  return {
    principalUsd: f.principalUsd,
    annualYieldPct: f.annualYieldPct,
    months: f.months,
    compounding: f.compounding,
    fees: { entryFeePct: f.entryFeePct, annualFeePct: f.annualFeePct, fixedCostUsd: f.fixedCostUsd },
    yieldDeclinePct: stressed ? f.yieldDeclinePct : 0,
    withdrawal: stressed && f.withdrawalOn
      ? { month: f.withdrawMonth, withdrawPct: f.withdrawPct, exitPenaltyPct: f.exitPenaltyPct, slippagePct: f.slippagePct }
      : null,
  };
}

export function SimulationLab() {
  const [form, setForm] = useState<Form>(DEFAULTS);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const scenario = useMemo(() => toScenario(form, true), [form]);
  const errors = useMemo(() => validateScenario(scenario), [scenario]);
  const comparison = useMemo(() => (errors.length === 0 ? compareStress(scenario) : null), [scenario, errors.length]);

  const declineRows = useMemo(() => {
    if (errors.length > 0) return [];
    return DECLINE_LEVELS.map((decline) => {
      const outcome = runScenario({ ...scenario, yieldDeclinePct: decline });
      return { decline, outcome };
    });
  }, [scenario, errors.length]);

  const simpleRef = simpleValue(form.principalUsd, form.annualYieldPct, form.months);
  const compoundRef = compoundValue(form.principalUsd, form.annualYieldPct, form.months);

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Simulation Lab"
        title="Project hypothetical outcomes"
        description="Model a position from your own assumptions, then stress it with yield declines and a forced withdrawal. Results are hypothetical projections, not guaranteed or live yields."
        actions={<DemoLabel note="Hypothetical" />}
      />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit space-y-6">
          <h2 className="text-sm font-semibold text-mist-100">Baseline assumptions</h2>

          <NumberField id="sim-principal" label="Starting amount" value={form.principalUsd} onChange={(v) => set("principalUsd", v)} min={0} step={100} suffix="USD" />
          <NumberField id="sim-yield" label="Assumed annual yield" value={form.annualYieldPct} onChange={(v) => set("annualYieldPct", v)} min={-100} max={100} step={0.1} suffix="%" hint="Your assumption, not a live rate." />
          <NumberField id="sim-months" label="Duration" value={form.months} onChange={(v) => set("months", v)} min={1} max={360} step={1} suffix="months" />
          <ChoiceGroup label="Return method" value={form.compounding} options={COMPOUND_OPTIONS} onChange={(v) => set("compounding", v)} />

          <div className="grid grid-cols-2 gap-4">
            <NumberField id="sim-entry" label="Entry fee" value={form.entryFeePct} onChange={(v) => set("entryFeePct", v)} min={0} max={100} step={0.1} suffix="%" />
            <NumberField id="sim-annual-fee" label="Annual fee" value={form.annualFeePct} onChange={(v) => set("annualFeePct", v)} min={0} max={100} step={0.1} suffix="%" />
          </div>
          <NumberField id="sim-fixed" label="Cost per transaction" value={form.fixedCostUsd} onChange={(v) => set("fixedCostUsd", v)} min={0} step={0.5} suffix="USD" hint="Applied to the deposit, the exit, and each withdrawal." />

          <div className="space-y-4 border-t border-line pt-6">
            <h2 className="text-sm font-semibold text-mist-100">Stress settings</h2>
            <ChoiceGroup
              label="Yield decline"
              value={String(form.yieldDeclinePct)}
              options={DECLINE_LEVELS.map((d) => ({ value: String(d), label: `${d}%` }))}
              onChange={(v) => set("yieldDeclinePct", Number(v))}
              hint="Reduces the yield by this share, for example 50% halves it."
            />
            <ChoiceGroup
              label="Forced withdrawal"
              value={form.withdrawalOn ? "on" : "off"}
              options={[
                { value: "off", label: "None" },
                { value: "on", label: "Partial withdrawal" },
              ]}
              onChange={(v) => set("withdrawalOn", v === "on")}
            />
            {form.withdrawalOn && (
              <div className="grid grid-cols-2 gap-4">
                <NumberField id="sim-wmonth" label="Withdraw in month" value={form.withdrawMonth} onChange={(v) => set("withdrawMonth", v)} min={1} step={1} />
                <NumberField id="sim-wpct" label="Share withdrawn" value={form.withdrawPct} onChange={(v) => set("withdrawPct", v)} min={0} max={100} step={5} suffix="%" />
                <NumberField id="sim-penalty" label="Exit penalty" value={form.exitPenaltyPct} onChange={(v) => set("exitPenaltyPct", v)} min={0} max={100} step={0.5} suffix="%" />
                <NumberField id="sim-slip" label="Slippage" value={form.slippagePct} onChange={(v) => set("slippagePct", v)} min={0} max={100} step={0.5} suffix="%" />
              </div>
            )}
          </div>

          <FormErrors errors={errors} />
        </Card>

        <div className="space-y-6">
          {comparison && comparison.baseline.valid && comparison.stressed.valid && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Baseline</p>
                  <p className="mt-2 text-2xl font-semibold text-mist-100">{formatUsdCents(comparison.baseline.totalValueUsd)}</p>
                  <p className="mt-1 text-sm text-mist-400">
                    Net gain {formatUsdCents(comparison.baseline.netGainUsd)} ({comparison.baseline.netReturnPct}%)
                  </p>
                  <p className="mt-3 text-xs text-mist-500">Effective yield {comparison.baseline.effectiveAnnualYieldPct}% before fees.</p>
                </Card>
                <Card highlight>
                  <p className="text-xs font-medium uppercase tracking-wider text-gold-400">Stressed</p>
                  <p className="mt-2 text-2xl font-semibold text-mist-100">{formatUsdCents(comparison.stressed.totalValueUsd)}</p>
                  <p className="mt-1 text-sm text-mist-400">
                    Net gain {formatUsdCents(comparison.stressed.netGainUsd)} ({comparison.stressed.netReturnPct}%)
                  </p>
                  <p className="mt-3 text-xs text-mist-500">Effective yield {comparison.stressed.effectiveAnnualYieldPct}% before fees.</p>
                </Card>
              </div>

              <Card className="text-sm">
                <p className="text-xs font-medium uppercase tracking-wider text-mist-500">Difference from baseline</p>
                <p className="mt-2 text-lg font-semibold text-mist-100">
                  {comparison.differenceUsd === null ? "Not available" : `${comparison.differenceUsd >= 0 ? "+" : ""}${formatUsdCents(comparison.differenceUsd)}`}
                  {comparison.differencePct !== null && <span className="ml-2 text-sm font-normal text-mist-400">({comparison.differencePct}%)</span>}
                </p>
                <p className="mt-2 text-mist-400">
                  {comparison.differenceUsd === 0
                    ? "No stress applied. Set a yield decline or a forced withdrawal to see the effect."
                    : "Negative values mean the stressed case ends with less than the baseline."}
                </p>
                <p className="mt-3 text-xs text-mist-500">
                  Transactions counted in the stressed case: {comparison.stressed.transactions}. Direct costs: {formatUsdCents(comparison.stressed.totalCostsUsd)}.
                </p>
              </Card>

              <Card className="space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-mist-100">Simple versus compounded (no stress, no fees)</h2>
                  <p className="mt-1 text-xs text-mist-500">Closed-form reference for the same starting amount, yield and duration.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-line bg-ink-800/60 p-4">
                    <p className="text-xs text-mist-500">Simple</p>
                    <p className="mt-1 font-semibold text-mist-100">{formatUsdCents(simpleRef)}</p>
                  </div>
                  <div className="rounded-xl border border-line bg-ink-800/60 p-4">
                    <p className="text-xs text-mist-500">Monthly compounding</p>
                    <p className="mt-1 font-semibold text-mist-100">{formatUsdCents(compoundRef)}</p>
                  </div>
                </div>
              </Card>

              <Card className="space-y-4">
                <h2 className="text-sm font-semibold text-mist-100">Yield decline scenarios</h2>
                <p className="text-xs text-mist-500">Uses your current duration, fees and withdrawal settings. Only the yield decline changes between rows.</p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[360px] text-left text-sm">
                    <thead className="text-xs text-mist-500">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Decline</th>
                        <th className="py-2 pr-3 font-medium">Effective yield</th>
                        <th className="py-2 pr-3 font-medium">Total value</th>
                        <th className="py-2 font-medium">Net gain</th>
                      </tr>
                    </thead>
                    <tbody>
                      {declineRows.map(({ decline, outcome }) => (
                        <tr key={decline} className="border-t border-line">
                          <td className="py-2.5 pr-3 text-mist-200">{decline}%</td>
                          <td className="py-2.5 pr-3 text-mist-400">{outcome.valid ? `${outcome.effectiveAnnualYieldPct}%` : "–"}</td>
                          <td className="py-2.5 pr-3 text-mist-100">{outcome.valid ? formatUsd(outcome.totalValueUsd) : "–"}</td>
                          <td className="py-2.5 text-mist-400">{outcome.valid ? formatUsdCents(outcome.netGainUsd) : "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}

          <Card className="space-y-3 text-sm leading-relaxed text-mist-400">
            <p className="font-medium text-mist-200">Assumptions used</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Yield is a constant annual rate that you enter. It is not forecast or observed.</li>
              <li>Simple returns earn interest on the invested base only. Monthly compounding earns interest on the running balance.</li>
              <li>The annual fee reduces the yield every month. Entry fees and cost per transaction are deducted up front or at exit.</li>
              <li>A forced withdrawal removes the stated share of the balance, then applies the exit penalty and slippage to that share.</li>
              <li>Outcomes exclude taxes, price moves in the underlying assets, and any loss from a protocol failure.</li>
            </ul>
            <p className="text-xs text-mist-500">
              A stressed outcome is a hypothetical scenario and does not predict what any strategy will do.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
