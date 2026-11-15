import { Link } from "react-router-dom";
import { ArrowRight, Gauge, LineChart, Radar, ShieldAlert, Waves } from "lucide-react";
import { Card } from "../components/ui/Card";
import { ButtonLink } from "../components/ui/Button";
import { WalletButton } from "../components/layout/WalletButton";
import { DEFAULT_NETWORK } from "../config/env";

const FEATURED = [
  { icon: Gauge, title: "Trove", body: "Read collateral and debt; manage supported Testnet actions.", to: "/app/trove" },
  { icon: ShieldAlert, title: "Trove Risk Lab", body: "Compare the current ratio with live MCR and price scenarios.", to: "/app/trove-risk" },
  { icon: Waves, title: "Protocol monitors", body: "Inspect pool reserves, CL positions, and activity.", to: "/app/pools" },
  { icon: Radar, title: "Chain Watch", body: "Read token balances for a public EVM address.", to: "/app/chain-watch" },
];

export function Landing() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-ink-950">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-gold-500/10 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: "linear-gradient(to right, #d4af6a 1px, transparent 1px), linear-gradient(to bottom, #d4af6a 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
      </div>

      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5 sm:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="MezoVault IQ home">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-gold-500/40 bg-ink-800 text-gold-400">
            <LineChart className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold tracking-tight">
            MezoVault <span className="gold-text">IQ</span>
          </span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-3">
          <Link to="/app" className="hidden text-sm text-mist-400 hover:text-mist-100 sm:inline">Overview</Link>
          <WalletButton />
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-20 pt-10 sm:px-8 lg:pt-20">
        <section className="max-w-3xl animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1 text-xs font-medium text-gold-300">
            {DEFAULT_NETWORK.label}
          </span>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-mist-100 sm:text-5xl lg:text-6xl">
            Trove management and risk analysis on Mezo.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-mist-400 sm:text-lg">
            Review your Trove, test price scenarios, and inspect protocol data.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink to="/app/trove" className="min-h-11 px-5 py-3">
              Open Trove <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </ButtonLink>
            <ButtonLink to="/app/trove-risk" variant="secondary" className="min-h-11 px-5 py-3">
              Trove Risk Lab <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </ButtonLink>
          </div>
        </section>

        <section aria-label="Features" className="mt-16 grid gap-4 sm:grid-cols-2">
          {FEATURED.map(({ icon: Icon, title, body, to }) => (
            <Link key={title} to={to} className="group block rounded-2xl focus-visible:outline-offset-4">
              <Card className="h-full transition group-hover:border-gold-500/40">
                <Icon className="h-5 w-5 text-gold-400" aria-hidden="true" />
                <h2 className="mt-4 text-base font-semibold text-mist-100">{title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-mist-400">{body}</p>
              </Card>
            </Link>
          ))}
        </section>

        <div className="mt-12 flex flex-col items-start gap-4 rounded-2xl border border-line bg-ink-900 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-mist-100">Connect a wallet to read balances</p>
            <p className="mt-1 text-sm text-mist-400">Review every transaction in your wallet.</p>
          </div>
          <WalletButton />
        </div>
      </main>

      <footer className="relative z-10 border-t border-line px-5 py-6 text-xs leading-relaxed text-mist-500 sm:px-8">
        <p className="mx-auto max-w-6xl">Experimental interface. Testnet assets have no real monetary value; DeFi carries risk.</p>
      </footer>
    </div>
  );
}
