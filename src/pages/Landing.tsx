import { Link } from "react-router-dom";
import { ArrowRight, LineChart, ShieldCheck, Radar } from "lucide-react";
import { Card } from "../components/ui/Card";
import { ButtonLink } from "../components/ui/Button";
import { WalletButton } from "../components/layout/WalletButton";
import { DEFAULT_NETWORK } from "../config/env";

const FEATURES = [
  { icon: ShieldCheck, title: "Read positions and protocol data", body: "Check balances, pool reserves, CL positions and Trove risk. Each monitor is read-only and reports unavailable data instead of filling gaps." },
  { icon: Radar, title: "Review wallet actions", body: "Prepare MUSD swaps, transfers, liquidity deposits and Trove actions, then inspect the request before you approve it in your wallet." },
];

const STEPS = [
  { n: "01", title: "Read", body: "Check balances and positions against the selected network. Read-only pages do not request signatures." },
  { n: "02", title: "Review", body: "Inspect amounts, network and transaction details before a wallet action." },
  { n: "03", title: "Check the result", body: "Use the transaction hash and receipt state to see what the chain accepted." },
];

const NETWORK_LABEL = DEFAULT_NETWORK.key === "testnet" ? "Mezo Testnet" : "Mezo Mainnet";

export function Landing() {
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

      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5 sm:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="MezoVault IQ home">
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
          <WalletButton />
        </nav>
      </header>

      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-20 pt-10 sm:px-8 lg:pt-20">
        <div className="max-w-3xl animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-gold-500/30 bg-gold-500/10 px-3 py-1 text-xs font-medium text-gold-300">
            {NETWORK_LABEL} · wallet tools and protocol monitors
          </span>
          <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-mist-100 sm:text-5xl lg:text-6xl">
            Inspect Mezo. Review each action.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-mist-400 sm:text-lg">
            Read balances, pools and positions. Prepare swaps, transfers and selected protocol actions, then review the request in your wallet. Read-only monitors do not ask you to sign.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink to="/app" className="min-h-11 px-5 py-3">
              Open dashboard <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </ButtonLink>
            <ButtonLink to="/app/chain-watch" variant="secondary" className="min-h-11 px-5 py-3">
              Check a public address <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-2">
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
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-mist-100 sm:text-3xl">Read first. Review before signing.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
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
            <p className="text-base font-semibold text-mist-100">Read balances on {NETWORK_LABEL}</p>
            <p className="mt-1 text-sm text-mist-400">Connect a wallet to read its MUSD, BTC and MEZO balances. This step sends no transaction.</p>
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
