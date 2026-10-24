import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  highlight?: boolean;
}

export function Card({ children, className = "", highlight = false }: CardProps) {
  return (
    <div
      className={[
        "rounded-2xl border bg-ink-900/80 p-5 backdrop-blur-sm sm:p-6",
        highlight
          ? "border-gold-500/40 shadow-[0_0_60px_-20px_rgba(212,175,106,0.35)]"
          : "border-line",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
