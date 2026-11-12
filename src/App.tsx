import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AppShell } from "./components/layout/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WalletProvider } from "./components/wallet/WalletProvider";
import { Landing } from "./pages/Landing";
import { Overview } from "./pages/Overview";
import { SimulationLab } from "./pages/SimulationLab";
import { Activity } from "./pages/Activity";
import { ProtocolEvidence } from "./pages/ProtocolEvidence";
import { PoolWatch } from "./pages/PoolWatch";
import { Send } from "./pages/Send";
import { Pay } from "./pages/Pay";
import { MusdPayLinks } from "./pages/MusdPayLinks";
import { BridgeRescue } from "./pages/BridgeRescue";
import { Trove } from "./pages/Trove";
import { TroveRiskLab } from "./pages/TroveRiskLab";
import { ChainWatch } from "./pages/ChainWatch";
import { ClPositionMonitor } from "./pages/ClPositionMonitor";
import { ClPlanner } from "./pages/ClPlanner";
import { IQStrategies } from "./pages/IQStrategies";
import { AllocationLab } from "./pages/AllocationLab";
import { Autopilot } from "./pages/Autopilot";

const X402Checkout = lazy(() => import("./pages/X402Checkout").then(({ X402Checkout }) => ({ default: X402Checkout })));

export default function App() {
  return (
    <BrowserRouter>
      <WalletProvider>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/pay" element={<Suspense fallback={<div className="p-8 text-sm text-mist-300" role="status">Loading MUSD checkout…</div>}><X402Checkout /></Suspense>} />
            <Route path="/app" element={<AppShell />}>
              <Route index element={<Overview />} />
              <Route path="send" element={<Send />} />
              <Route path="pay" element={<Pay />} />
              <Route path="pay-links" element={<MusdPayLinks />} />
              <Route path="bridge-rescue" element={<BridgeRescue />} />
              <Route path="trove" element={<Trove />} />
              <Route path="trove-risk" element={<TroveRiskLab />} />
              <Route path="chain-watch" element={<ChainWatch />} />
              <Route path="cl-positions" element={<ClPositionMonitor />} />
              <Route path="cl-planner" element={<ClPlanner />} />
              <Route path="smart-vaults" element={<ProtocolEvidence />} />
              <Route path="vaults" element={<ProtocolEvidence />} />
              <Route path="protocol-evidence" element={<ProtocolEvidence />} />
              <Route path="strategies" element={<IQStrategies />} />
              <Route path="pools" element={<PoolWatch />} />
              <Route path="allocation" element={<AllocationLab />} />
              <Route path="simulation" element={<SimulationLab />} />
              <Route path="autopilot" element={<Autopilot />} />
              <Route path="activity" element={<Activity />} />
              <Route path="*" element={<Navigate to="/app" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </WalletProvider>
    </BrowserRouter>
  );
}
