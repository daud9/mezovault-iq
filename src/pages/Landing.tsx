import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Gauge,
  LineChart,
  Link2,
  Radar,
  ShieldAlert,
  Waves,
} from "lucide-react";
import { Card } from "../components/ui/Card";
import { ButtonLink } from "../components/ui/Button";
import { WalletButton } from "../components/layout/WalletButton";
import { DEFAULT_NETWORK } from "../config/env";

const CORE_TOOLS = [
  {
    icon: Gauge,
    eyebrow: "TROVE",
    title: "Position. Collateral. Debt.",
    body: "Review a Trove, open a position, or add BTC collateral on Testnet.",
    to: "/app/trove",
    action: "Explore Trove",
  },
  {
    icon: ShieldAlert,
    eyebrow: "TROVE RISK LAB",
    title: "Test the price. Read the ratio.",
    body: "Compare a current ratio with MCR across hypothetical BTC prices.",
    to: "/app/trove-risk",
    action: "Open Risk Lab",
  },
];

const MORE_TOOLS = [
  {
    icon: Waves,
    eyebrow: "POOL WATCH · CL",
    title: "Pools. Positions. Ranges.",
    body: "Read configured reserves, inspect CL positions, and estimate a range.",
    links: [
      { label: "Pool Watch", to: "/app/pools" },
      { label: "CL Positions", to: "/app/cl-positions" },
      { label: "CL Planner", to: "/app/cl-planner" },
    ],
  },
  {
    icon: Radar,
    eyebrow: "CHAIN WATCH",
    title: "Public balances. By network.",
    body: "Read MUSD and MEZO balances for an address on configured networks.",
    links: [{ label: "Watch an address", to: "/app/chain-watch" }],
  },
  {
    icon: Link2,
    eyebrow: "BRIDGE STATUS",
    title: "Follow indexed activity.",
    body: "Search recent indexed Mezo Testnet bridge operations.",
    links: [{ label: "Check bridge status", to: "/app/bridge-status" }],
  },
  {
    icon: Activity,
    eyebrow: "ACTIVITY",
    title: "Your tracked activity.",
    body: "Review browser-saved app hashes and loaded MUSD/MEZO transfer logs.",
    links: [{ label: "View activity", to: "/app/activity" }],
  },
];

export function Landing() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-ink-950">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-48 left-1/2 h-[34rem] w-[54rem] -translate-x-1/2 rounded-full bg-gold-500/[0.09] blur-[130px]" />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: "linear-gradient(to right, #d4af6a 1px, transparent 1px), linear-gradient(to bottom, #d4af6a 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
      </div>

      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4 sm:px-8 sm:py-5">
        <Link to="/" className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg" aria-label="MezoVault IQ home">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-gold-500/40 bg-ink-800 text-gold-300 shadow-[0_0_28px_-12px_rgba(212,175,106,0.65)]">
            <LineChart className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold tracking-tight sm:text-base">
            MezoVault <span className="gold-text">IQ</span>
          </span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-3">
          <a href="#tools" className="hidden min-h-11 items-center rounded-lg px-2 text-sm text-mist-300 transition hover:text-mist-100 focus-visible:outline-offset-2 sm:inline-flex">Tools</a>
          <Link to="/app" className="hidden min-h-11 items-center rounded-lg px-2 text-sm text-mist-300 transition hover:text-mist-100 focus-visible:outline-offset-2 sm:inline-flex">Overview</Link>
          <WalletButton compact />
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-16 pt-8 sm:px-8 sm:pt-12 lg:pb-24 lg:pt-16">
        <section aria-labelledby="hero-title" className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
          <div className="animate-fade-up">
            <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/[0.08] px-3 text-xs font-semibold tracking-wide text-gold-300">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-gold-300" />
              {DEFAULT_NETWORK.label}
            </span>
            <h1 id="hero-title" className="mt-6 max-w-2xl text-[2.55rem] font-semibold leading-[1.06] tracking-[-0.045em] text-mist-100 sm:text-6xl lg:text-[4.35rem]">
              Trove tools.
              <span className="block gold-text">MUSD flows.</span>
              Risk in view.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-mist-300 sm:text-lg">
              A focused console for Mezo Testnet positions, MUSD, and protocol reads.
            </p>
            <div className="mt-7 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center">
              <ButtonLink to="/app" className="min-h-12 justify-center px-5 py-3">
                Explore the tools <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </ButtonLink>
              <ButtonLink to="/app/trove" variant="secondary" className="min-h-12 justify-center px-5 py-3">
                Open Trove
              </ButtonLink>
            </div>
            <p className="mt-5 inline-flex min-h-10 items-center rounded-lg border border-line bg-ink-900/80 px-3 text-sm text-mist-300">
              Testnet only <span aria-hidden="true" className="mx-2 text-mist-500">·</span> No real monetary value
            </p>
          </div>

          <aside aria-label="MezoVault tool overview" className="relative overflow-hidden rounded-3xl border border-gold-500/20 bg-gradient-to-br from-ink-800/90 via-ink-900/95 to-ink-950 p-5 shadow-[0_24px_90px_-50px_rgba(212,175,106,0.35)] sm:p-7">
            <div aria-hidden="true" className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-gold-500/[0.08] blur-3xl" />
            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mist-400">Inside the console</p>
                <span className="rounded-full border border-line bg-ink-950/70 px-2.5 py-1 text-[11px] font-medium text-mist-300">TESTNET</span>
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-mist-100 sm:text-3xl">Read. Review. Model.</h2>
              <p className="mt-2 max-w-sm text-sm leading-relaxed text-mist-400">A clear starting point for supported actions and on-chain data.</p>
              <div className="mt-6 space-y-2">
                <Link to="/app/trove" className="group flex min-h-[4.25rem] items-center gap-3 rounded-xl border border-line/80 bg-ink-950/60 px-3 transition hover:border-gold-500/40 hover:bg-ink-800/80 sm:px-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gold-500/10 text-gold-300"><Gauge className="h-5 w-5" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-mist-100">Trove</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-mist-400">Collateral · debt · supported actions</span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-mist-500 transition group-hover:text-gold-300" aria-hidden="true" />
                </Link>
                <Link to="/app/send" className="group flex min-h-[4.25rem] items-center gap-3 rounded-xl border border-line/80 bg-ink-950/60 px-3 transition hover:border-gold-500/40 hover:bg-ink-800/80 sm:px-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gold-500/10 text-gold-300"><LineChart className="h-5 w-5" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-mist-100">MUSD</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-mist-400">Send · swap · Pay Links</span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-mist-500 transition group-hover:text-gold-300" aria-hidden="true" />
                </Link>
                <Link to="/app/trove-risk" className="group flex min-h-[4.25rem] items-center gap-3 rounded-xl border border-line/80 bg-ink-950/60 px-3 transition hover:border-gold-500/40 hover:bg-ink-800/80 sm:px-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gold-500/10 text-gold-300"><ShieldAlert className="h-5 w-5" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-mist-100">Trove Risk Lab</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-mist-400">Current ratio · hypothetical prices</span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-mist-500 transition group-hover:text-gold-300" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </aside>
        </section>

        <section id="tools" aria-labelledby="core-tools-title" className="mt-20 scroll-mt-6 sm:mt-24">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-300">Start here</p>
              <h2 id="core-tools-title" className="mt-2 text-2xl font-semibold tracking-tight text-mist-100 sm:text-3xl">The core tools</h2>
            </div>
            <p className="max-w-md text-sm leading-relaxed text-mist-400">Position checks, MUSD flows, and hypothetical risk analysis.</p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {CORE_TOOLS.map(({ icon: Icon, eyebrow, title, body, to, action }) => (
              <Link key={to} to={to} className="group block h-full rounded-2xl focus-visible:outline-offset-4">
                <Card className="flex h-full min-h-64 flex-col transition duration-200 group-hover:border-gold-500/40 group-hover:bg-ink-900">
                  <div className="flex items-center justify-between gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-xl border border-gold-500/20 bg-gold-500/[0.08] text-gold-300"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                    <span className="text-[11px] font-semibold tracking-[0.15em] text-mist-500">{eyebrow}</span>
                  </div>
                  <h3 className="mt-5 text-xl font-semibold tracking-tight text-mist-100">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-mist-400">{body}</p>
                  <span className="mt-auto inline-flex min-h-11 items-end gap-2 pt-5 text-sm font-semibold text-gold-300">
                    {action} <ArrowRight className="mb-0.5 h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </Card>
              </Link>
            ))}

            <Card className="flex h-full min-h-64 flex-col border-gold-500/25 bg-gradient-to-br from-gold-500/[0.08] to-ink-900/90">
              <div className="flex items-center justify-between gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-gold-500/25 bg-ink-950/60 text-gold-300"><LineChart className="h-5 w-5" aria-hidden="true" /></span>
                <span className="text-[11px] font-semibold tracking-[0.15em] text-gold-300">MUSD TOOLS</span>
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-tight text-mist-100">Send. Swap. Share.</h3>
              <p className="mt-2 text-sm leading-relaxed text-mist-400">MUSD transfers, a reviewed swap flow, and reusable x402 Pay Links.</p>
              <div className="mt-auto grid grid-cols-3 gap-2 pt-5">
                <Link to="/app/send" className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg border border-line bg-ink-950/70 px-1 text-xs font-medium text-mist-200 transition hover:border-gold-500/40 hover:text-mist-100 focus-visible:outline-offset-2 sm:px-2 sm:text-sm">Send</Link>
                <Link to="/app/swap" className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg border border-line bg-ink-950/70 px-1 text-xs font-medium text-mist-200 transition hover:border-gold-500/40 hover:text-mist-100 focus-visible:outline-offset-2 sm:px-2 sm:text-sm">Review swap</Link>
                <Link to="/app/pay-links" className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg border border-line bg-ink-950/70 px-1 text-xs font-medium text-mist-200 transition hover:border-gold-500/40 hover:text-mist-100 focus-visible:outline-offset-2 sm:px-2 sm:text-sm">Pay Links</Link>
              </div>
            </Card>
          </div>
        </section>

        <section aria-labelledby="more-tools-title" className="mt-20 sm:mt-24">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-300">Beyond the basics</p>
              <h2 id="more-tools-title" className="mt-2 text-2xl font-semibold tracking-tight text-mist-100 sm:text-3xl">Protocol reads and tracking</h2>
            </div>
            <Link to="/app" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gold-300 hover:text-gold-200 focus-visible:outline-offset-2">
              See all tools <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {MORE_TOOLS.map(({ icon: Icon, eyebrow, title, body, links }) => (
              <Card key={eyebrow} className="flex h-full flex-col transition duration-200 hover:border-gold-500/30">
                <Icon className="h-5 w-5 text-gold-300" aria-hidden="true" />
                <p className="mt-4 text-[10px] font-semibold tracking-[0.15em] text-mist-500">{eyebrow}</p>
                <h3 className="mt-2 text-lg font-semibold tracking-tight text-mist-100">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mist-400">{body}</p>
                <div className="mt-auto flex flex-wrap gap-1 pt-4">
                  {links.map(({ label, to }) => (
                    <Link key={to} to={to} className="inline-flex min-h-11 items-center gap-1 rounded-lg pr-2 text-sm font-medium text-gold-300 hover:text-gold-200 focus-visible:outline-offset-2">
                      {label} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section aria-label="Connect a wallet" className="mt-16 flex flex-col gap-4 rounded-2xl border border-line bg-ink-900/90 p-5 sm:mt-20 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-base font-semibold text-mist-100">Ready to look closer?</p>
            <p className="mt-1 text-sm text-mist-400">Connect a wallet to read balances and review supported actions.</p>
          </div>
          <WalletButton compact className="self-start sm:self-auto" />
        </section>
      </main>

      <footer className="relative z-10 border-t border-line px-5 py-5 text-xs leading-relaxed text-mist-500 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p>MezoVault IQ <span aria-hidden="true" className="mx-1">·</span> {DEFAULT_NETWORK.label}</p>
          <p>Testnet assets have no real monetary value. DeFi carries risk.</p>
        </div>
      </footer>
    </div>
  );
}
