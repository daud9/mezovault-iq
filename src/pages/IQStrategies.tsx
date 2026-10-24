import { useMemo, useState } from "react";
import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { EmptyState } from "../components/ui/StateViews";
import { ChoiceGroup } from "../components/forms/ChoiceGroup";
import { NumberField } from "../components/forms/NumberField";
import { FormErrors } from "../components/forms/FormErrors";
import { StrategyCard } from "../components/strategies/StrategyCard";
import { VERIFIED_STRATEGY_PROFILES } from "../engine/catalog";
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
  targetYieldPct: 0,
};

export function IQStrategies() {
  const [prefs, setPrefs] = useState<StrategyPreferences>(DEFAULT_PREFS);

  const errors = useMemo(() => validatePreferences(prefs), [prefs]);
  const matches = useMemo(
    () => (errors.length === 0 ? matchStrategies(VERIFIED_STRATEGY_PROFILES, prefs) : []),
    [prefs, errors.length],
  );

  const update = <K extends keyof StrategyPreferences>(key: K, value: StrategyPreferences[K]) =>
    setPrefs((p) => ({ ...p, [key]: value }));

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="IQ Strategies"
        title="Strategies backed by verified contracts"
        description="A strategy is listed only when its protocol contract is verified on Mezo Testnet. Your preferences filter the list; they never create one."
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit space-y-6 lg:sticky lg:top-40">
          <h2 className="text-sm font-semibold text-mist-100">Your preferences</h2>
          <NumberField id="capital" label="Investment capital" value={prefs.capitalUsd} onChange={(v) => update("capitalUsd", v)} min={1} step={100} suffix="USD" />
          <ChoiceGroup label="Risk tolerance" value={prefs.risk} options={RISK_OPTIONS} onChange={(v) => update("risk", v)} />
          <ChoiceGroup label="Investment horizon" value={String(prefs.horizonMonths)} options={HORIZON_OPTIONS} onChange={(v) => update("horizonMonths", Number(v))} />
          <ChoiceGroup
            label="Minimum liquidity"
            value={prefs.maxExitDays === null ? "any" : String(prefs.maxExitDays)}
            options={LIQUIDITY_OPTIONS}
            onChange={(v) => update("maxExitDays", v === "any" ? null : Number(v))}
          />
          <NumberField id="target-yield" label="Target annual yield (optional filter)" value={prefs.targetYieldPct} onChange={(v) => update("targetYieldPct", v)} min={0} max={100} step={0.5} suffix="%" hint="Used only to order verified strategies. It does not create or imply a yield." />
          <FormErrors errors={errors} />
        </Card>

        <div className="space-y-6">
          {errors.length > 0 ? (
            <EmptyState title="Fix the highlighted preferences" description="Results appear once every preference is valid." />
          ) : matches.length === 0 ? (
            <EmptyState
              title="No verified strategies are available"
              description="No strategy on Mezo Testnet currently has a verified protocol contract, an official source and readable on-chain data. Nothing is shown in its place. This list fills in only when such a strategy is verified."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {matches.map((m) => (
                <StrategyCard key={m.profile.id} match={m} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
