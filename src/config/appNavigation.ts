import {
  Activity as ActivityIcon,
  Radar,
  FlaskRound,
  Gauge,
  LayoutDashboard,
  Send,
  ArrowLeftRight,
  Link2,
  Waves,
} from "lucide-react";

export const APP_NAV = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/app/swap", label: "MUSD Swap", icon: ArrowLeftRight },
  { to: "/app/send", label: "Send", icon: Send },
  { to: "/app/pay-links", label: "MUSD Pay Links", icon: Link2 },
  { to: "/app/bridge-status", label: "Bridge Status Tracker", icon: Radar },
  { to: "/app/chain-watch", label: "Chain Watch", icon: Radar },
  { to: "/app/cl-positions", label: "CL Positions", icon: Waves },
  { to: "/app/cl-planner", label: "CL Planner", icon: Waves },
  { to: "/app/pools", label: "Pool Watch", icon: Waves },
  { to: "/app/simulation", label: "Simulation Lab", icon: FlaskRound },
  { to: "/app/trove", label: "Trove", icon: Gauge },
  { to: "/app/trove-risk", label: "Trove Risk Lab", icon: Gauge },
  { to: "/app/activity", label: "Activity", icon: ActivityIcon },
] as const;

/** Keep only the bridge route alias; unknown app paths use the generic Overview fallback. */
export const APP_ROUTE_REDIRECTS = [
  { path: "bridge-rescue", to: "/app/bridge-status" },
] as const;
