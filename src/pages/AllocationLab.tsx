import { useMemo, useState } from "react";
import { Card } from "../components/ui/Card";
import { SectionHeader } from "../components/ui/SectionHeader";
import { EmptyState } from "../components/ui/StateViews";
import { ChoiceGroup } from "../components/forms/ChoiceGroup";
import { NumberField } from "../components/forms/NumberField";
import { FormErrors } from "../components/forms/FormErrors";
import { formatUsdCents } from "../lib/format";
import { VERIFIED_STRATEGY_PROFILES } from "../engine/catalog";
import { useMusdBalance } from "../hooks/useMusdBalance";
import { useWallet } from "../components/wallet/WalletProvider";
import { Button } from "../components/ui/Button";
import { generateAllocation, validateAllocation, type AllocationRequest } from "../engine/allocation";
import type { RiskTolerance } from "../engine/types";

const RISK_OPTIONS: { value: RiskTolerance; label: string }[] = [
  { value: "Conservative", label: "Conservative" },
  { value: "Moderate", label: "Moderate" },
  { value: "Aggressive", label: "Aggressive" },
];

export function AllocationLab() {
  const [capitalUsd, setCapitalUsd] = useState(10_000);
  const [minReserveUsd, setMinReserveUsd] = useState(1_000);
  const [maxAllocationPct, setMaxAllocationPct] = useState(30);
  const [risk, setRisk] = useState<RiskTolerance>("Moderate");

  const { state, isSupportedNetwork } = useWallet();
  const { view: musdView } = useMusdBalance();
  const onChainMusd = musdView.status === "done" && musdView.result.status === "ok" ? musdView.result : null;

  const eligibleIds = useMemo(() => VERIFIED_STRATEGY_PROFILES.map((p) => p.id), []);
  const request: AllocationRequest = { capitalUsd, minReserveUsd, maxAllocationPct, risk, eligibleIds };
  const inputErrors = validateAllocation(request);

  const hasVerified = VERIFIED_STRATEGY_PROFILES.length > 0;
  const result = hasVerified && inputErrors.length === 0 ? generateAllocation(request, VERIFIED_STRATEGY_PROFILES) : null;

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Allocation Lab"
        title="Plan your own allocation"
        description="Enter your capital, reserve and limits. Allocations are generated only from verified strategies. Your inputs are assumptions, and nothing here is executed."
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit space-y-6">
          <h2 className="text-sm font-semibold text-mist-100">Your assumptions</h2>
          <NumberField id="alloc-capital" label="Capital available" value={capitalUsd} onChange={setCapitalUsd} min={0} step={100} suffix="USD" hint="Your own figure, unless you use your wallet balance below." />
          {state.status === "connected" && isSupportedNetwork && (
            <div className="space-y-2 rounded-lg border border-line bg-ink-800/60 p-3">
              {onChainMusd ? (
                <>
                  <p className="text-xs text-mist-400">On-chain MUSD balance: <span className="text-mist-100">{onChainMusd.formatted} MUSD</span></p>
                  <Button variant="secondary" onClick={() => setCapitalUsd(Number(onChainMusd.formatted.replace(/,/g, "")))} className="min-h-11 w-full">
                    Use my MUSD balance as capital
                  </Button>
                </>
              ) : (
                <p className="text-xs text-mist-500">Your MUSD balance will appear here once it is read from the chain.</p>
              )}
            </div>
          )}
          <NumberField id="alloc-reserve" label="Minimum liquid reserve" value={minReserveUsd} onChange={setMinReserveUsd} min={0} step={100} suffix="USD" hint="Kept uninvested in every outcome." />
          <NumberField id="alloc-cap" label="Maximum per strategy" value={maxAllocationPct} onChange={setMaxAllocationPct} min={0} max={100} step={5} suffix="% of capital" />
          <ChoiceGroup label="Risk preference" value={risk} options={RISK_OPTIONS} onChange={setRisk} />
          <FormErrors errors={inputErrors} />
        </Card>

        <div className="space-y-6">
          {!hasVerified ? (
            <EmptyState
              title="No verified strategies to allocate across"
              description="Allocations need at least one verified strategy with a readable contract. None is available on Mezo Testnet, so no allocation or projected return is generated."
            />
          ) : result ? (
            <Card className="space-y-4">
              <h2 className="text-sm font-semibold text-mist-100">Proposed allocation (your assumptions)</h2>
              <p className="text-sm text-mist-300">
                Deployable {formatUsdCents(result.deployableUsd)} · Allocated {formatUsdCents(result.allocatedUsd)} · Unplaced {formatUsdCents(result.unplacedUsd)}
              </p>
              {result.lines.map((l) => (
                <p key={l.strategyId} className="text-sm text-mist-400">
                  <span className="text-mist-200">{l.name}:</span> {formatUsdCents(l.amountUsd)} ({l.percentOfCapital}%)
                </p>
              ))}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
