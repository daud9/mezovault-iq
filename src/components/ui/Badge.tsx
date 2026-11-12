import type { ReactNode } from "react";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "gold" }) {
  const styles =
    tone === "gold"
      ? "border-gold-500/40 bg-gold-500/10 text-gold-300"
      : "border-line bg-ink-800 text-mist-300";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles}`}>
      {children}
    </span>
  );
}
