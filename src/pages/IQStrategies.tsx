import { useMemo, useState } from "react";
import { Card } from "../components/ui/Card";
import { Badge, RiskBadge } from "../components/ui/Badge";
import { SectionHeader } from "../components/ui/SectionHeader";
import { DemoLabel } from "../components/ui/DemoLabel";
import { EmptyState } from "../components/ui/StateViews";
import { DEMO_STRATEGIES } from "../data/demo";
import { formatRange } from "../lib/format";
import type { RiskLevel } from "../types";

const FILTERS: ("All" | RiskLevel)[] = ["All", "Low", "Medium", "High"];

export function IQStrategies() {
  const [filter, setFilter] = useState<"All" | RiskLevel>("All");
  const strategies = useMemo(
    () => DEMO_STRATEGIES.filter((s) => filter === "All" || s.risk === filter),
    [filter],
  );

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="IQ Strategies"
        title="Discover strategies by risk"
        description="Each entry describes a strategy concept and its risk profile. APY bands are illustrative, not live or historical rates."
        actions={<DemoLabel note="Illustrative concepts" />}
      />

      <div role="group" aria-label="Filter by risk" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={[
              "rounded-full border px-4 py-1.5 text-sm font-medium transition",
              filter === f
                ? "border-gold-500/50 bg-gold-500/10 text-gold-300"
                : "border-line text-mist-400 hover:text-mist-100",
            ].join(" ")}
          >
            {f}
          </button>
        ))}
      </div>

      {strategies.length === 0 ? (
        <EmptyState title="No strategies match" description="Try a different risk filter." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {strategies.map((s) => (
            <Card key={s.id} className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge>{s.category}</Badge>
                  <h2 className="mt-3 text-lg font-semibold text-mist-100">{s.name}</h2>
                </div>
                <RiskBadge risk={s.risk} />
              </div>
              <p className="text-sm leading-relaxed text-mist-400">{s.summary}</p>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <div className="text-sm">
                  <span className="text-mist-500">Illustrative APY </span>
                  <span className="font-semibold text-mist-100">{formatRange(s.illustrativeApy)}</span>
                </div>
                <div className="flex gap-1.5">
                  {s.assets.map((a) => (
                    <Badge key={a}>{a}</Badge>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="text-sm leading-relaxed text-mist-400">
        <p className="font-medium text-mist-200">Strategy analysis arrives in Stage 2</p>
        <p className="mt-1">
          Live APY, contract audit status, and smart-contract risk scoring will be added once a data source is connected.
          Nothing on this page is an endorsement or a recommendation to invest.
        </p>
      </Card>
    </div>
  );
}
