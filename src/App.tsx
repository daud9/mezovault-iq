import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AppShell } from "./components/layout/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WalletProvider } from "./components/wallet/WalletProvider";
import { Landing } from "./pages/Landing";
import { APP_ROUTE_REDIRECTS } from "./config/appNavigation";

const Overview = lazy(() => import("./pages/Overview").then(({ Overview }) => ({ default: Overview })));
const MusdSwap = lazy(() => import("./pages/MusdSwap").then(({ MusdSwap }) => ({ default: MusdSwap })));
const Activity = lazy(() => import("./pages/Activity").then(({ Activity }) => ({ default: Activity })));
const PoolWatch = lazy(() => import("./pages/PoolWatch").then(({ PoolWatch }) => ({ default: PoolWatch })));
const Send = lazy(() => import("./pages/Send").then(({ Send }) => ({ default: Send })));
const Pay = lazy(() => import("./pages/Pay").then(({ Pay }) => ({ default: Pay })));
const MusdPayLinks = lazy(() => import("./pages/MusdPayLinks").then(({ MusdPayLinks }) => ({ default: MusdPayLinks })));
const Trove = lazy(() => import("./pages/Trove").then(({ Trove }) => ({ default: Trove })));
const TroveRiskLab = lazy(() => import("./pages/TroveRiskLab").then(({ TroveRiskLab }) => ({ default: TroveRiskLab })));
const ChainWatch = lazy(() => import("./pages/ChainWatch").then(({ ChainWatch }) => ({ default: ChainWatch })));
const ClPositionMonitor = lazy(() => import("./pages/ClPositionMonitor").then(({ ClPositionMonitor }) => ({ default: ClPositionMonitor })));
const ClPlanner = lazy(() => import("./pages/ClPlanner").then(({ ClPlanner }) => ({ default: ClPlanner })));
const BridgeStatusTracker = lazy(() => import("./pages/BridgeStatusTracker").then(({ BridgeStatusTracker }) => ({ default: BridgeStatusTracker })));
const X402Checkout = lazy(() => import("./pages/X402Checkout").then(({ X402Checkout }) => ({ default: X402Checkout })));

export default function App() {
  return (
    <BrowserRouter>
      <WalletProvider>
        <ErrorBoundary>
          <Suspense fallback={<div className="p-8 text-sm text-mist-300" role="status">Loading page…</div>}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/pay" element={<X402Checkout />} />
              <Route path="/app" element={<AppShell />}>
                <Route index element={<Overview />} />
                <Route path="send" element={<Send />} />
                <Route path="swap" element={<MusdSwap />} />
                <Route path="pay" element={<Pay />} />
                <Route path="pay-links" element={<MusdPayLinks />} />
                <Route path="bridge-status" element={<BridgeStatusTracker />} />
                {APP_ROUTE_REDIRECTS.map(({ path, to }) => (
                  <Route key={path} path={path} element={<Navigate to={to} replace />} />
                ))}
                <Route path="trove" element={<Trove />} />
                <Route path="trove-risk" element={<TroveRiskLab />} />
                <Route path="chain-watch" element={<ChainWatch />} />
                <Route path="cl-positions" element={<ClPositionMonitor />} />
                <Route path="cl-planner" element={<ClPlanner />} />
                <Route path="pools" element={<PoolWatch />} />
                <Route path="activity" element={<Activity />} />
                <Route path="*" element={<Navigate to="/app" replace />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </WalletProvider>
    </BrowserRouter>
  );
}
