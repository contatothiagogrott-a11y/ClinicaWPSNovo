/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { StoreProvider } from "./contexts/StoreContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Metrics from "./pages/Metrics";
import Inventory from "./pages/Inventory";
import Agenda from "./pages/Agenda";
import Waitlist from "./pages/Waitlist";
import ActiveClients from "./pages/ActiveClients";
import ClientProfile from "./pages/ClientProfile";
import Settings from "./pages/Settings";
import MySettings from "./pages/MySettings";
import UsersManagement from "./pages/UsersManagement";
import CapacityManagement from "./pages/CapacityManagement";
import Atendimentos from "./pages/Atendimentos";
import FinishedCases from "./pages/FinishedCases";
import GroupsList from "./pages/GroupsList";
import GroupProfile from "./pages/GroupProfile";

export default function App() {
  return (
    <StoreProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="metrics" element={<Metrics />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="agenda" element={<Agenda />} />
            <Route path="waitlist" element={<Waitlist />} />
            <Route path="active" element={<ActiveClients />} />
            <Route path="finished" element={<FinishedCases />} />
            <Route path="groups" element={<GroupsList />} />
            <Route path="group/:id" element={<GroupProfile />} />
            <Route path="client/:id" element={<ClientProfile />} />
            <Route path="settings" element={<Settings />} />
            <Route path="my-settings" element={<MySettings />} />
            <Route path="users" element={<UsersManagement />} />
              <Route path="capacity" element={<CapacityManagement />} />
              <Route path="atendimentos" element={<Atendimentos />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </StoreProvider>
  );
}
