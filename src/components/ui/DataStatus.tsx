import { CheckCircle2, CircleDashed, FlaskConical, XCircle } from "lucide-react";

export type DataState = "live" | "unavailable" | "unverified" | "not-configured" | "demo";

const STYLE: Record<DataState, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  live: { label: "Live, from chain", cls: "border-risk-low/40 bg-risk-low/10 text-risk-low", Icon: CheckCircle2 },
  unavailable: { label: "Unavailable", cls: "border-risk-high/40 bg-risk-high/10 text-risk-high", Icon: XCircle },
  unverified: { label: "Unverified", cls: "border-risk-medium/40 bg-risk-medium/10 text-risk-medium", Icon: CircleDashed },
  "not-configured": { label: "Not configured", cls: "border-line bg-ink-800 text-mist-400", Icon: CircleDashed },
  demo: { label: "Demonstration", cls: "border-dashed border-gold-500/50 bg-transparent text-gold-300", Icon: FlaskConical },
};

/** States where the source and freshness of a figure are shown explicitly. */
export function DataStatus({ state, detail }: { state: DataState; detail?: string }) {
  const { label, cls, Icon } = STYLE[state];
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {label}
      {detail && <span className="text-mist-500">· {detail}</span>}
    </span>
  );
}
