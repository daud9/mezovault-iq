import { FlaskConical } from "lucide-react";

/** Marks any figure that is illustrative rather than live. Use on all demo data. */
export function DemoLabel({ note = "Demo data" }: { note?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-gold-500/50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-gold-300">
      <FlaskConical className="h-3 w-3" aria-hidden="true" />
      {note}
    </span>
  );
}
