import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";

type Variant = "primary" | "secondary" | "ghost";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-br from-gold-300 to-gold-500 text-ink-950 hover:brightness-110 shadow-[0_8px_30px_-12px_rgba(212,175,106,0.6)]",
  secondary: "border border-line bg-ink-800 text-mist-100 hover:border-gold-500/50",
  ghost: "text-mist-300 hover:text-gold-300",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({ variant = "primary", className = "", children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      ].join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
}

interface ButtonLinkProps {
  to: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}

/** Navigation styled as a button. Renders an anchor, never a button inside a link. */
export function ButtonLink({ to, variant = "primary", className = "", children }: ButtonLinkProps) {
  return (
    <Link
      to={to}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
        variants[variant],
        className,
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
