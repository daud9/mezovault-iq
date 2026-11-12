import {
  Activity as ActivityIcon,
  Radar,
  FlaskRound,
  Gauge,
  LayoutDashboard,
  ShieldCheck,
  Send,
  Link2,
  Waves,
} from "lucide-react";

export const APP_NAV = [
  { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/app/trove", label: "Trove", icon: Gauge },
  { to: "/app/send", label: "Send", icon: Send },
  { to: "/app/pay-links", label: "MUSD Pay Links", icon: Link2 },
  { to: "/app/bridge-status", label: "Bridge Status Tracker", icon: Radar },
  { to: "/app/chain-watch", label: "Chain Watch", icon: Radar },
  { to: "/app/cl-positions", label: "CL Positions", icon: Waves },
  { to: "/app/cl-planner", label: "CL Planner", icon: Waves },
  { to: "/app/protocol-evidence", label: "Protocol Evidence", icon: ShieldCheck },
  { to: "/app/pools", label: "Pool Watch", icon: Waves },
  { to: "/app/simulation", label: "Simulation Lab", icon: FlaskRound },
  { to: "/app/trove-risk", label: "Trove Risk Lab", icon: Gauge },
  { to: "/app/activity", label: "Activity", icon: ActivityIcon },
] as const;

/** Old or unavailable pages return users to Overview rather than showing a placeholder. */
export const APP_ROUTE_REDIRECTS = [
  { path: "strategies", to: "/app" },
  { path: "allocation", to: "/app" },
  { path: "autopilot", to: "/app" },
  { path: "bridge-rescue", to: "/app/bridge-status" },
] as const;
