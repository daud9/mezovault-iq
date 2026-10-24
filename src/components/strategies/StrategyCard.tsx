import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { CheckStatus, StrategyMatch } from "../../engine/matching";
import type { SecurityStatus } from "../../engine/types";
import { Badge, RiskBadge } from "../ui/Badge";
import { Card } from "../ui/Card";
import { formatRange } from "../../lib/format";

const STATUS_TEXT: Record<CheckStatus, string> = {
  meets: "Meets",
  partial: "Partly",
  unknown: "Unverified",
  conflicts: "Conflicts",
};

const STATUS_STYLE: Record<CheckStatus, string> = {
  meets: "text-risk-low",
  partial: "text-risk-medium",
  unknown: "text-mist-400",
  conflicts: "text-risk-high",
};

const AUDIT_TEXT: Record<SecurityStatus, string> = {
  "verified-audit": "Verified audit on record",
  "partial-review": "Partial review on record",
  "none-known": "No audit known",
  unknown: "Unknown. No verified audit information in this build.",
};

export function StrategyCard({ match }: { match: StrategyMatch }) {
  const [open, setOpen] = useState(false);
  const { profile: p, quality: q } = match;
  const panelId = `details-${p.id}`;

  const eligibility = !match.eligible
    ? { label: "Not eligible", cls: "border-risk-high/40 bg-risk-high/10 text-risk-high" }
    : match.hasUnknowns
      ? { label: "Eligible, unverified", cls: "border-risk-medium/40 bg-risk-medium/10 text-risk-medium" }
      : { label: "Eligible", cls: "border-risk-low/40 bg-risk-low/10 text-risk-low" };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-mist-500">
            #{match.rank} · {p.category}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-mist-100">{p.name}</h2>
        </div>
        <RiskBadge risk={p.risk} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${eligibility.cls}`}>
          {eligibility.label}
        </span>
        <Badge>Illustrative {formatRange(p.illustrativeApy)}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-mist-500">Assessment (known evidence only)</p>
          <p className="mt-1 font-semibold text-mist-100">{q.score === null ? "Withheld" : q.score.toFixed(1)}</p>
          <p className="mt-0.5 text-xs text-mist-500">
            Evidence coverage {q.coveragePct}%
          </p>
          <p className="mt-0.5 text-xs text-mist-500">Evidence-adjusted {q.adjustedScore.toFixed(1)}</p>
        </div>
        <div>
          <p className="text-xs text-mist-500">Exit time (assumed)</p>
          <p className="mt-1 font-semibold text-mist-100">
            {p.liquidityDays === null ? "Unknown" : `${p.liquidityDays} day${p.liquidityDays === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      <ul className="space-y-2 border-t border-line pt-4">
        {match.checks.map((c) => (
          <li key={c.key} className="text-sm leading-relaxed">
            <span className={`mr-2 text-xs font-semibold uppercase tracking-wide ${STATUS_STYLE[c.status]}`}>
              {STATUS_TEXT[c.status]}
            </span>
            <span className="text-mist-400">{c.message}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm font-medium text-mist-300 transition hover:border-gold-500/40 hover:text-mist-100"
      >
        Profile and evidence
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div id={panelId} className="space-y-5 text-sm leading-relaxed text-mist-400">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gold-400">Yield source</h3>
            <p className="mt-1.5">{p.yieldSource.description}</p>
            <p className="mt-1 text-xs text-mist-500">Documentation clarity: {p.yieldSource.clarity}</p>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gold-400">Liquidity</h3>
            <p className="mt-1.5">{p.liquidityNote}</p>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gold-400">Protocol and security</h3>
            <dl className="mt-1.5 grid gap-2">
              <div><dt className="text-xs text-mist-500">Protocol</dt><dd>{p.protocol.name} ({p.protocol.network})</dd></div>
              <div><dt className="text-xs text-mist-500">Audit status</dt><dd>{AUDIT_TEXT[p.protocol.auditStatus]}</dd></div>
              <div><dt className="text-xs text-mist-500">Contract address</dt><dd>Not recorded. No verified address in this build.</dd></div>
              <div><dt className="text-xs text-mist-500">Historical performance</dt><dd>{p.historicalPerformanceScore === null ? "Unknown. No verified history." : `Score ${p.historicalPerformanceScore}`}</dd></div>
            </dl>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gold-400">Data source and freshness</h3>
            <p className="mt-1.5">{p.dataSource.label}</p>
            <p className="mt-0.5 text-xs text-mist-500">{p.dataSource.freshness}</p>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gold-400">Yield Quality Score breakdown</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[320px] text-left text-xs">
                <thead className="text-mist-500">
                  <tr>
                    <th className="py-1.5 pr-2 font-medium">Component</th>
                    <th className="py-1.5 pr-2 font-medium">Weight</th>
                    <th className="py-1.5 pr-2 font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {q.components.map((c) => (
                    <tr key={c.key} className="border-t border-line align-top">
                      <td className="py-2 pr-2">
                        <span className="text-mist-200">{c.label}</span>
                        <span className="block text-mist-500">{c.reason}</span>
                      </td>
                      <td className="py-2 pr-2">{c.weight}%</td>
                      <td className="py-2 pr-2">{c.value === null ? "Unknown" : c.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-mist-500">
              The assessment averages only known components. The evidence-adjusted score counts unknown components as zero and is used for ranking. Assessments are withheld below 50% evidence coverage.
            </p>
          </section>
        </div>
      )}
    </Card>
  );
}
