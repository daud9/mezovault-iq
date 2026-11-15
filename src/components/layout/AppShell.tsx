import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Gauge, MoreHorizontal } from "lucide-react";
import { DEFAULT_NETWORK } from "../../config/env";
import { APP_NAV, MOBILE_MORE_NAV, MOBILE_PRIMARY_NAV } from "../../config/appNavigation";
import { WalletButton } from "./WalletButton";
import { Badge } from "../ui/Badge";

interface NavItemProps {
  to: string;
  label: string;
  icon: typeof Gauge;
  end?: boolean;
}

export function AppShell() {
  const location = useLocation();
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const previousPath = useRef(location.pathname);
  const moreActive = MOBILE_MORE_NAV.some(({ to }) => location.pathname === to || location.pathname.startsWith(`${to}/`));

  useEffect(() => {
    if (previousPath.current !== location.pathname) {
      previousPath.current = location.pathname;
      mainRef.current?.focus();
    }
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-ink-950">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:border focus:border-gold-400 focus:bg-ink-900 focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-gold-300"
      >
        Skip to main content
      </a>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-ink-900 px-4 py-6 lg:flex">
          <Brand />
          <nav aria-label="Primary" className="mt-8 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain pr-1">
            {APP_NAV.map((item) => (
              <SideLink key={item.to} {...item} />
            ))}
          </nav>
          <div className="mt-4 rounded-xl border border-line bg-ink-800/60 p-3 text-xs leading-relaxed text-mist-400">
            {DEFAULT_NETWORK.label} · Review every wallet request.
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-line bg-ink-950/85 backdrop-blur-md">
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <div className="lg:hidden"><Brand /></div>
              <div className="hidden lg:block" />
              <div className="flex items-center gap-2">
                <Badge tone="gold">
                  <span className="sm:hidden">{DEFAULT_NETWORK.key === "testnet" ? "Testnet" : "Mainnet"}</span>
                  <span className="hidden sm:inline">{DEFAULT_NETWORK.label}</span>
                </Badge>
                <WalletButton compact />
              </div>
            </div>
            <nav aria-label="Primary mobile" className="border-t border-line px-2 py-2 lg:hidden">
              <div className="grid grid-cols-5 gap-1">
                {MOBILE_PRIMARY_NAV.map((item) => (
                  <MobilePrimaryLink key={item.to} {...item} onNavigate={() => setMobileMoreOpen(false)} />
                ))}
                <button
                  type="button"
                  aria-label="More tools"
                  aria-expanded={mobileMoreOpen}
                  aria-controls="mobile-tools-menu"
                  onClick={() => setMobileMoreOpen((open) => !open)}
                  className={[
                    "flex min-h-11 min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium leading-tight transition",
                    mobileMoreOpen || moreActive ? "bg-gold-500/15 text-gold-300" : "text-mist-400 hover:text-mist-100",
                  ].join(" ")}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  <span>More</span>
                </button>
              </div>
              <div
                id="mobile-tools-menu"
                className={mobileMoreOpen ? "mt-2 grid grid-cols-2 gap-2 border-t border-line pt-2" : "hidden"}
              >
                {MOBILE_MORE_NAV.map((item) => (
                  <MobileMoreLink key={item.to} {...item} onNavigate={() => setMobileMoreOpen(false)} />
                ))}
              </div>
            </nav>
          </header>

          <main
            ref={mainRef}
            id="main-content"
            tabIndex={-1}
            className="flex-1 scroll-mt-32 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"
          >
            <div className="mx-auto w-full max-w-6xl animate-fade-up">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <NavLink to="/" className="flex shrink-0 items-center gap-2.5" aria-label="MezoVault IQ home">
      <span className="grid h-8 w-8 place-items-center rounded-lg border border-gold-500/40 bg-ink-800">
        <Gauge className="h-4 w-4 text-gold-400" aria-hidden="true" />
      </span>
      <span className="whitespace-nowrap text-sm font-semibold tracking-tight text-mist-100 max-[360px]:text-xs">
        MezoVault <span className="gold-text">IQ</span>
      </span>
    </NavLink>
  );
}

function SideLink({ to, label, icon: Icon, end }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
          isActive ? "bg-ink-700 text-gold-300" : "text-mist-400 hover:bg-ink-800 hover:text-mist-100",
        ].join(" ")
      }
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {label}
    </NavLink>
  );
}

function mobileLabel(label: string) {
  if (label === "Trove Risk Lab") return "Risk Lab";
  if (label === "Pool Watch") return "Pools";
  if (label === "MUSD Swap") return "Swap";
  return label;
}

function MobilePrimaryLink({ to, label, icon: Icon, end, onNavigate }: NavItemProps & { onNavigate: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      title={label}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          "flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-medium leading-tight transition",
          isActive ? "bg-gold-500/15 text-gold-300" : "text-mist-400 hover:text-mist-100",
        ].join(" ")
      }
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="max-w-full truncate">{mobileLabel(label)}</span>
    </NavLink>
  );
}

function MobileMoreLink({ to, label, icon: Icon, end, onNavigate }: NavItemProps & { onNavigate: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          "flex min-h-11 min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
          isActive ? "bg-gold-500/15 text-gold-300" : "text-mist-300 hover:bg-ink-800 hover:text-mist-100",
        ].join(" ")
      }
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );
}
