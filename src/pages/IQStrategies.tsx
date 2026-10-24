import { useMemo, useState } from "react";
import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DemoLabel } from "../components/ui/DemoLabel";
import { EmptyState } from "../components/ui/StateViews";
import { ChoiceGroup } from "../components/forms/ChoiceGroup";
import { NumberField } from "../components/forms/NumberField";
import { FormErrors } from "../components/forms/FormErrors";
import { StrategyCard } from "../components/strategies/StrategyCard";
import { STRATEGY_PROFILES } from "../engine/catalog";
import { matchStrategies, validatePreferences, type StrategyPreferences } from "../engine/matching";
import type { RiskTolerance } from "../engine/types";

const RISK_OPTIONS: { value: RiskTolerance; label: string }[] = [
  { value: "Conservative", label: "Conservative" },
  { value: "Moderate", label: "Moderate" },
  { value: "Aggressive", label: "Aggressive" },
];

const HORIZON_OPTIONS = [
  { value: "3", label: "3 mo" },
  { value: "6", label: "6 mo" },
  { value: "12", label: "12 mo" },
  { value: "24", label: "24 mo" },
  { value: "36", label: "36 mo" },
];

const LIQUIDITY_OPTIONS = [
  { value: "1", label: "Within 1 day" },
  { value: "7", label: "Within 7 days" },
  { value: "14", label: "Within 14 days" },
  { value: "any", label: "No requirement" },
];

const DEFAULT_PREFS: StrategyPreferences = {
  capitalUsd: 5_000,
  risk: "Moderate",
  horizonMonths: 12,
  maxExitDays: 7,
  targetYieldPct: 6,
};

export function IQStrategies() {
  const [prefs, setPrefs] = useState<StrategyPreferences>(DEFAULT_PREFS);

  const errors = useMemo(() => validatePreferences(prefs), [prefs]);
  const matches = useMemo(
    () => (errors.length === 0 ? matchStrategies(STRATEGY_PROFILES, prefs) : []),
    [prefs, errors.length],
  );

  const eligibleCount = matches.filter((m) => m.eligible && !m.hasUnknowns).length;
  const unverifiedCount = matches.filter((m) => m.eligible && m.hasUnknowns).length;
  const excludedCount = matches.filter((m) => !m.eligible).length;

  const update = <K extends keyof StrategyPreferences>(key: K, value: StrategyPreferences[K]) =>
    setPrefs((p) => ({ ...p, [key]: value }));

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="IQ Strategy Engine"
        title="Find strategies that fit your constraints"
        description="Set your capital, risk tolerance, horizon, liquidity requirement and target yield. Each strategy is checked against them, with the reasons shown."
        actions={<DemoLabel note="Demonstration strategies" />}
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit space-y-6 lg:sticky lg:top-40">
          <h2 className="text-sm font-semibold text-mist-100">Your preferences</h2>

          <NumberField
            id="capital"
            label="Investment capital"
            value={prefs.capitalUsd}
            onChange={(v) => update("capitalUsd", v)}
            min={1}
            step={100}
            suffix="USD"
          />

          <ChoiceGroup
            label="Risk tolerance"
            value={prefs.risk}
            options={RISK_OPTIONS}
            onChange={(v) => update("risk", v)}
            hint={
              prefs.risk === "Conservative"
                ? "Low-risk strategies only."
                : prefs.risk === "Moderate"
                  ? "Low and medium-risk strategies."
                  : "All risk levels."
            }
          />

          <ChoiceGroup
            label="Investment horizon"
            value={String(prefs.horizonMonths) as string}
            options={HORIZON_OPTIONS}
            onChange={(v) => update("horizonMonths", Number(v))}
          />

          <ChoiceGroup
            label="Minimum liquidity"
            value={prefs.maxExitDays === null ? "any" : String(prefs.maxExitDays)}
            options={LIQUIDITY_OPTIONS}
            onChange={(v) => update("maxExitDays", v === "any" ? null : Number(v))}
            hint="How quickly you need to be able to exit."
          />

          <NumberField
            id="target-yield"
            label="Target annual yield"
            value={prefs.targetYieldPct}
            onChange={(v) => update("targetYieldPct", v)}
            min={0}
            max={100}
            step={0.5}
            suffix="%"
            hint="Used for ranking only. Illustrative ranges are not guaranteed."
          />

          <FormErrors errors={errors} />
        </Card>

        <div className="space-y-6">
          {errors.length === 0 && (
            <Card className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <span className="text-mist-300">
                <strong className="text-risk-low">{eligibleCount}</strong> verified match{eligibleCount === 1 ? "" : "es"}
              </span>
              <span className="text-mist-300">
                <strong className="text-risk-medium">{unverifiedCount}</strong> with unverified criteria
              </span>
              <span className="text-mist-300">
                <strong className="text-risk-high">{excludedCount}</strong> excluded
              </span>
            </Card>
          )}

          {errors.length > 0 ? (
            <EmptyState title="Fix the highlighted preferences" description="Results appear once every preference is valid." />
          ) : matches.length === 0 ? (
            <EmptyState title="No strategies available" description="The catalogue is empty." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {matches.map((m) => (
                <StrategyCard key={m.profile.id} match={m} />
              ))}
            </div>
          )}

          <Card className="space-y-2 text-sm leading-relaxed text-mist-400">
            <p className="font-medium text-mist-200">How to read these results</p>
            <p>
              Ranking puts verified matches first, then unverified ones, then strategies that conflict with a hard constraint.
              Within each group, the target yield and the Yield Quality Score decide the order.
            </p>
            <p>
              The Yield Quality Score measures how well a strategy is documented and evidenced. It is not a return forecast.
              Ranges and exit times are illustrative assumptions, and nothing here is a recommendation to invest.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
