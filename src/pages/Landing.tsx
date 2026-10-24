import { Link } from "react-router-dom";
import { ArrowRight, Compass, LineChart, ShieldCheck, SlidersHorizontal, Bot } from "lucide-react";
import { Card } from "../components/ui/Card";
import { ButtonLink } from "../components/ui/Button";
import { DemoLabel } from "../components/ui/DemoLabel";
import { RiskBadge } from "../components/ui/Badge";
import { DEMO_ALLOCATION, DEMO_PORTFOLIO_VALUE_USD, DEMO_STRATEGIES } from "../data/demo";
import { formatRange, formatUsd } from "../lib/format";
import { WalletButton } from "../components/layout/WalletButton";

const FEATURES = [
  { icon: Compass, title: "IQ Strategies", body: "Discover MUSD and MEZO strategies with risk tiers and clear mechanics." },
  { icon: ShieldCheck, title: "Vault Intelligence", body: "Evaluate contracts, collateral quality and concentration before capital moves." },
  { icon: SlidersHorizontal, title: "Allocation & Simulation", body: "Test allocations and outcome scenarios against your own assumptions." },
  { icon: Bot, title: "Autopilot (planned)", body: "Future automation limited to permissions you explicitly grant and can revoke." },
];

const STEPS = [
  { n: "01", title: "Understand", body: "See each strategy's mechanics, risks and the assets it touches." },
  { n: "02", title: "Simulate", body: "Model allocations and compounding scenarios before committing anything." },
  { n: "03", title: "Allocate", body: "Set target weights and review them against your risk tolerance." },
];

export function Landing() {
  const preview = DEMO_STRATEGIES.slice(0, 3);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-ink-950">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-gold-500/10 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #d4af6a 1px, transparent 1px), linear-gradient(to bottom, #d4af6a 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
      </div>

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5" aria-label="MezoVault IQ home">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-gold-500/40 bg-ink-800 text-gold-400">
            <LineChart className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold tracking-tight">
            MezoVault <span className="gold-text">IQ</span>
          </span>
        </Link>
        <nav className="flex items-center gap-3">
          <Link to="/app" className="hidden text-sm text-mist-400 hover:text-mist-100 sm:inline">
            Dashboard
          </Link>
          <span className="rounded-full border border-line px-3 py-1.5 text-xs text-mist-400">Stage 1 preview</span>
        </nav>
      </header>

      <section className="relative z-10 mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-12 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pt-20">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1 text-xs font-medium text-gold-300">
            Built around MUSD and the Mezo ecosystem
          </span>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-mist-100 sm:text-5xl lg:text-6xl">
            Institutional-grade clarity for <span className="gold-text">Bitcoin-backed</span> yield.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-mist-400 sm:text-lg">
            MezoVault IQ helps you discover DeFi strategies, evaluate their risk, simulate portfolio outcomes, and
            eventually manage allocations through permissions you control.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink to="/app" className="px-5 py-3">
              Open dashboard <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </ButtonLink>
            <ButtonLink to="/app/strategies" variant="secondary" className="px-5 py-3">
              Explore strategies
            </ButtonLink>
          </div>
          <p className="mt-5 text-xs text-mist-500">
            Stage 1 is read-only. No deposits, withdrawals or automated transactions are available yet.
          </p>
        </div>

        {/* Dashboard preview */}
        <Card highlight className="animate-fade-up space-y-5 [animation-delay:150ms]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-mist-500">Portfolio preview</p>
              <p className="mt-1 text-3xl font-semibold text-mist-100">{formatUsd(DEMO_PORTFOLIO_VALUE_USD)}</p>
            </div>
            <DemoLabel />
          </div>

          <div className="flex h-2.5 overflow-hidden rounded-full bg-ink-700" role="img" aria-label="Demo allocation breakdown">
            {DEMO_ALLOCATION.map((b, i) => (
              <div
                key={b.id}
                style={{ width: `${b.percent}%` }}
                className={["h-full", i === 0 ? "bg-gold-400" : i === 1 ? "bg-gold-500/70" : i === 2 ? "bg-gold-500/40" : "bg-mist-500/40"].join(" ")}
              />
            ))}
          </div>

          <ul className="divide-y divide-line">
            {preview.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-mist-100">{s.name}</p>
                  <p className="text-xs text-mist-500">Illustrative {formatRange(s.illustrativeApy)}</p>
                </div>
                <RiskBadge risk={s.risk} />
              </li>
            ))}
          </ul>

          <p className="text-xs leading-relaxed text-mist-500">
            Figures above are illustrative demonstration data, not live yields or balances.
          </p>
        </Card>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="transition hover:border-gold-500/40">
              <Icon className="h-5 w-5 text-gold-400" aria-hidden="true" />
              <h3 className="mt-4 text-sm font-semibold text-mist-100">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mist-400">{body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-400">How it works</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-mist-100 sm:text-3xl">Understand before you allocate.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((step) => (
            <Card key={step.n}>
              <span className="text-xs font-semibold text-gold-500">{step.n}</span>
              <h3 className="mt-3 text-lg font-semibold text-mist-100">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mist-400">{step.body}</p>
            </Card>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-start gap-4 rounded-2xl border border-line bg-ink-900 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-semibold text-mist-100">Read your MUSD balance on Mezo Testnet</p>
            <p className="mt-1 text-sm text-mist-400">Connect a wallet to read your balance. Read-only, with no transactions.</p>
          </div>
          <WalletButton />
        </div>
      </section>

      <footer className="relative z-10 border-t border-line px-5 py-8 text-xs leading-relaxed text-mist-500 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <p>
            MezoVault IQ is an experimental research interface. Nothing on this site is financial, legal or investment
            advice. DeFi carries smart-contract, liquidity and market risk, including total loss of funds.
          </p>
        </div>
      </footer>
    </div>
  );
}
