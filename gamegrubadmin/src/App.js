import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import {
  ADMIN_PERMISSIONS,
  getAdminProfile,
  getAdminToken,
  hasAdminPermission,
} from "./config/adminSession";
import Login from "./pages/LoginScreen";
import Dashboard from "./pages/Dashboard";
import PCs from "./pages/RigFleet";
import Menu from "./pages/MenuStudio";
import Bookings from "./pages/BookingsHub";
import Users from "./pages/PlayersHub";
import AdminPOS from "./pages/POSDesk";
import AdminBillingHistory from "./pages/BillingArchive";
import FinanceOperations from "./pages/FinanceOperations";
import AdminOrders from "./pages/KitchenQueue";
import AdminAccess from "./pages/AdminAccess";
import TournamentsArena from "./pages/TournamentsArena";
import CommunityPulseStudio from "./pages/CommunityPulseStudio";
import AppSettings from "./pages/AppSettings";
import BusinessManagement from "./pages/BusinessManagement";
import SupportDesk from "./pages/SupportDesk";
import { AdminThemeProvider } from "./theme/AdminThemeContext";
import { AdminBusinessProvider } from "./context/AdminBusinessContext";

const ADMIN_ROUTES = [
  {
    path: "/dashboard",
    permission: ADMIN_PERMISSIONS.DASHBOARD_READ,
    element: <Dashboard />,
  },
  {
    path: "/pcs",
    permission: ADMIN_PERMISSIONS.STATIONS_MANAGE,
    element: <PCs />,
  },
  {
    path: "/menu",
    permission: ADMIN_PERMISSIONS.MENU_MANAGE,
    element: <Menu />,
  },
  {
    path: "/bookings",
    permission: ADMIN_PERMISSIONS.BOOKINGS_READ,
    element: <Bookings />,
  },
  {
    path: "/users",
    permission: ADMIN_PERMISSIONS.USERS_READ,
    element: <Users />,
  },
  {
    path: "/pos",
    permission: ADMIN_PERMISSIONS.POS_READ,
    element: <AdminPOS />,
  },
  {
    path: "/orders",
    permission: ADMIN_PERMISSIONS.ORDERS_MANAGE,
    element: <AdminOrders />,
  },
  {
    path: "/billing",
    permission: ADMIN_PERMISSIONS.BILLING_READ,
    element: <AdminBillingHistory />,
  },
  {
    path: "/finance",
    permission: ADMIN_PERMISSIONS.BILLING_READ,
    element: <FinanceOperations />,
  },
  {
    path: "/support",
    permission: ADMIN_PERMISSIONS.SUPPORT_MANAGE,
    element: <SupportDesk />,
  },
  {
    path: "/tournaments",
    permission: ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE,
    element: <TournamentsArena />,
  },
  {
    path: "/community",
    permission: ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE,
    element: <CommunityPulseStudio />,
  },
  {
    path: "/admins",
    permission: ADMIN_PERMISSIONS.ADMIN_ACCESS_MANAGE,
    element: <AdminAccess />,
  },
  {
    path: "/businesses",
    permission: ADMIN_PERMISSIONS.ADMIN_ACCESS_MANAGE,
    element: <BusinessManagement />,
  },
  {
    path: "/settings",
    permission: null,
    element: <AppSettings />,
  },
];

function ProtectedRoute({ children, requiredPermission = null }) {
  const token = getAdminToken();
  const admin = getAdminProfile();

  if (!token) return <Navigate to="/" replace />;
  if (requiredPermission && !hasAdminPermission(requiredPermission, admin)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function App() {
  return (
    <AdminThemeProvider>
      <AdminBusinessProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Login />} />
            {ADMIN_ROUTES.map((route) => (
              <Route
                key={route.path}
                path={route.path}
                element={
                  <ProtectedRoute requiredPermission={route.permission}>
                    {route.element}
                  </ProtectedRoute>
                }
              />
            ))}
          </Routes>
        </BrowserRouter>
      </AdminBusinessProvider>
    </AdminThemeProvider>
  );
}

export default App;
