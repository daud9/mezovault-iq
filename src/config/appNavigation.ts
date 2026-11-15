import {
  Activity as ActivityIcon,
  Radar,
  Gauge,
  LayoutDashboard,
  Send,
  ArrowLeftRight,
  Link2,
  Waves,
} from "lucide-react";

export const APP_NAV = [
  { to: "/app/trove", label: "Trove", icon: Gauge },
  { to: "/app/trove-risk", label: "Trove Risk Lab", icon: Gauge },
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/app/pools", label: "Pool Watch", icon: Waves },
  { to: "/app/cl-positions", label: "CL Positions", icon: Waves },
  { to: "/app/cl-planner", label: "CL Planner", icon: Waves },
  { to: "/app/chain-watch", label: "Chain Watch", icon: Radar },
  { to: "/app/bridge-status", label: "Bridge Status", icon: Radar },
  { to: "/app/activity", label: "Activity", icon: ActivityIcon },
  { to: "/app/swap", label: "MUSD Swap", icon: ArrowLeftRight },
  { to: "/app/send", label: "Send", icon: Send },
  { to: "/app/pay-links", label: "MUSD Pay Links", icon: Link2 },
] as const;

const MOBILE_PRIMARY_PATHS = new Set<string>(["/app/trove", "/app/trove-risk", "/app", "/app/pools"]);
export const MOBILE_PRIMARY_NAV = APP_NAV.filter(({ to }) => MOBILE_PRIMARY_PATHS.has(to));
export const MOBILE_MORE_NAV = APP_NAV.filter(({ to }) => !MOBILE_PRIMARY_PATHS.has(to));
