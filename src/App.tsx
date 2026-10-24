import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Landing } from "./pages/Landing";
import { Overview } from "./pages/Overview";
import { IQStrategies } from "./pages/IQStrategies";
import { VaultIntelligence } from "./pages/VaultIntelligence";
import { AllocationLab } from "./pages/AllocationLab";
import { SimulationLab } from "./pages/SimulationLab";
import { Autopilot } from "./pages/Autopilot";
import { Activity } from "./pages/Activity";

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app" element={<AppShell />}>
            <Route index element={<Overview />} />
            <Route path="strategies" element={<IQStrategies />} />
            <Route path="vaults" element={<VaultIntelligence />} />
            <Route path="allocation" element={<AllocationLab />} />
            <Route path="simulation" element={<SimulationLab />} />
            <Route path="autopilot" element={<Autopilot />} />
            <Route path="activity" element={<Activity />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
