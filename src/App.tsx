import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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
import { Trove } from "./pages/Trove";
import { TroveRiskLab } from "./pages/TroveRiskLab";

export default function App() {
  return (
    <BrowserRouter>
      <WalletProvider>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<AppShell />}>
            <Route index element={<Overview />} />
            <Route path="send" element={<Send />} />
            <Route path="pay" element={<Pay />} />
            <Route path="trove" element={<Trove />} />
            <Route path="trove-risk" element={<TroveRiskLab />} />
            <Route path="smart-vaults" element={<ProtocolEvidence />} />
            <Route path="vaults" element={<ProtocolEvidence />} />
            <Route path="protocol-evidence" element={<ProtocolEvidence />} />
            <Route path="strategies" element={<PoolWatch />} />
            <Route path="pools" element={<PoolWatch />} />
            <Route path="allocation" element={<Navigate to="/app/pools" replace />} />
            <Route path="simulation" element={<SimulationLab />} />
            <Route path="autopilot" element={<Navigate to="/app/trove-risk" replace />} />
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
