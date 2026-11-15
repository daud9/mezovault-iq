import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AppShell } from "./components/layout/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WalletProvider } from "./components/wallet/WalletProvider";
import { Landing } from "./pages/Landing";

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
          <Suspense fallback={<div className="p-8 text-sm text-mist-300" role="status">Loading…</div>}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/pay" element={<X402Checkout />} />
              <Route path="/app" element={<AppShell />}>
                <Route index element={<Overview />} />
                <Route path="trove" element={<Trove />} />
                <Route path="trove-risk" element={<TroveRiskLab />} />
                <Route path="pools" element={<PoolWatch />} />
                <Route path="cl-positions" element={<ClPositionMonitor />} />
                <Route path="cl-planner" element={<ClPlanner />} />
                <Route path="chain-watch" element={<ChainWatch />} />
                <Route path="bridge-status" element={<BridgeStatusTracker />} />
                <Route path="activity" element={<Activity />} />
                <Route path="swap" element={<MusdSwap />} />
                <Route path="send" element={<Send />} />
                <Route path="pay-links" element={<MusdPayLinks />} />
                <Route path="pay" element={<Pay />} />
                <Route path="*" element={<NotFound inApp />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </WalletProvider>
    </BrowserRouter>
  );
}

function NotFound({ inApp = false }: { inApp?: boolean }) {
  return (
    <section aria-labelledby="not-found-title" className="mx-auto flex min-h-[40vh] max-w-xl flex-col justify-center gap-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-gold-400">404</p>
      <h1 id="not-found-title" className="text-2xl font-semibold text-mist-100">Page not found</h1>
      <Link to={inApp ? "/app" : "/"} className="inline-flex min-h-11 items-center text-sm font-medium text-gold-300 hover:underline">
        {inApp ? "Open Overview" : "Back to home"}
      </Link>
    </section>
  );
}
