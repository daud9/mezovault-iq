import { NavLink, Outlet } from "react-router-dom";
import {
  Activity as ActivityIcon,
  Bot,
  FlaskRound,
  Gauge,
  LayoutDashboard,
  Scale,
  Sparkles,
  ShieldCheck,
  Landmark,
} from "lucide-react";
import { DEFAULT_NETWORK } from "../../config/env";
import { WalletButton } from "./WalletButton";
import { Badge } from "../ui/Badge";

export const APP_NAV = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/app/smart-vaults", label: "Smart Vaults", icon: Landmark },
  { to: "/app/strategies", label: "IQ Strategies", icon: Sparkles },
  { to: "/app/vaults", label: "Vault Intelligence", icon: ShieldCheck },
  { to: "/app/allocation", label: "Allocation Lab", icon: Scale },
  { to: "/app/simulation", label: "Simulation Lab", icon: FlaskRound },
  { to: "/app/autopilot", label: "Autopilot", icon: Bot },
  { to: "/app/activity", label: "Activity", icon: ActivityIcon },
] as const;

export function AppShell() {
  return (
    <div className="min-h-dvh bg-ink-950">
      <div className="flex min-h-dvh">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-ink-900 px-4 py-6 lg:flex">
          <Brand />
          <nav aria-label="Primary" className="mt-8 flex flex-col gap-1">
            {APP_NAV.map((item) => (
              <SideLink key={item.to} {...item} />
            ))}
          </nav>
          <div className="mt-auto rounded-xl border border-line bg-ink-800/60 p-4 text-xs leading-relaxed text-mist-400">
            <p className="font-medium text-mist-200">Read-only</p>
            <p className="mt-1">No deposits, withdrawals or automated transactions are made by this app.</p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-line bg-ink-950/85 backdrop-blur-md">
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <div className="lg:hidden"><Brand compact /></div>
              <div className="hidden lg:block" />
              <div className="flex items-center gap-2">
                <Badge tone="gold">{DEFAULT_NETWORK.label}</Badge>
                <WalletButton />
              </div>
            </div>
            {/* Mobile horizontal nav */}
            <nav aria-label="Primary mobile" className="flex gap-1 overflow-x-auto border-t border-line px-3 py-2 lg:hidden">
              {APP_NAV.map((item) => (
                <MobileLink key={item.to} {...item} />
              ))}
            </nav>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
            <div className="mx-auto w-full max-w-6xl animate-fade-up">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <NavLink to="/" className="flex items-center gap-2.5" aria-label="MezoVault IQ home">
      <span className="grid h-8 w-8 place-items-center rounded-lg border border-gold-500/40 bg-ink-800">
        <Gauge className="h-4 w-4 text-gold-400" aria-hidden="true" />
      </span>
      <span className="text-sm font-semibold tracking-tight text-mist-100">
        MezoVault <span className="gold-text">IQ</span>
        
      </span>
    </NavLink>
  );
}

function SideLink({ to, label, icon: Icon, end }: { to: string; label: string; icon: typeof Gauge; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
          isActive ? "bg-ink-700 text-gold-300" : "text-mist-400 hover:bg-ink-800 hover:text-mist-100",
        ].join(" ")
      }
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </NavLink>
  );
}

function MobileLink({ to, label, icon: Icon, end }: { to: string; label: string; icon: typeof Gauge; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
          isActive ? "bg-gold-500/15 text-gold-300" : "text-mist-400",
        ].join(" ")
      }
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </NavLink>
  );
}
