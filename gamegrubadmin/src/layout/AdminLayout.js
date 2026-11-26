import axios from "axios";
import { NavLink, useLocation } from "react-router-dom";

import {
  ADMIN_PERMISSIONS,
  clearAdminSession,
  getAdminProfile,
  hasAdminPermission,
} from "../config/adminSession";
import { API_BASE_URL } from "../config/api";
import { useAdminBusiness } from "../context/AdminBusinessContext";

const NAV_ITEMS = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: "DB",
    section: "Overview",
    description: "Revenue, occupancy, booking momentum, and player growth.",
    permission: ADMIN_PERMISSIONS.DASHBOARD_READ,
  },
  {
    to: "/bookings",
    label: "Bookings",
    icon: "BK",
    section: "Operations",
    description: "Reservations, live sessions, and booking changes.",
    permission: ADMIN_PERMISSIONS.BOOKINGS_READ,
  },
  {
    to: "/pcs",
    label: "Stations",
    icon: "ST",
    section: "Operations",
    description: "Machine status, pricing, and floor availability.",
    permission: ADMIN_PERMISSIONS.STATIONS_MANAGE,
  },
  {
    to: "/orders",
    label: "Orders",
    icon: "OR",
    section: "Operations",
    description: "Kitchen queue, fulfillment, and order value.",
    permission: ADMIN_PERMISSIONS.ORDERS_MANAGE,
  },
  {
    to: "/pos",
    label: "POS",
    icon: "PS",
    section: "Operations",
    description: "Settlement, payment, and final checkout actions.",
    permission: ADMIN_PERMISSIONS.POS_READ,
  },
  {
    to: "/menu",
    label: "Menu",
    icon: "MN",
    section: "Experience",
    description: "Food catalog, pricing, and offer visibility.",
    permission: ADMIN_PERMISSIONS.MENU_MANAGE,
  },
  {
    to: "/users",
    label: "Players",
    icon: "PL",
    section: "Experience",
    description: "Loyalty, spend, and membership-facing player history.",
    permission: ADMIN_PERMISSIONS.USERS_READ,
  },
  {
    to: "/community",
    label: "Community",
    icon: "CM",
    section: "Experience",
    description: "Engagement signals and live player activity.",
    permission: ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE,
  },
  {
    to: "/tournaments",
    label: "Tournaments",
    icon: "TM",
    section: "Experience",
    description: "Brackets, fixtures, and competitive events.",
    permission: ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE,
  },
  {
    to: "/billing",
    label: "Billing",
    icon: "BL",
    section: "Control",
    description: "Invoices, payment history, and settlement archives.",
    permission: ADMIN_PERMISSIONS.BILLING_READ,
  },
  {
    to: "/finance",
    label: "Finance ops",
    icon: "FX",
    section: "Control",
    description: "Refunds, payment reconciliation, and audit notes.",
    permission: ADMIN_PERMISSIONS.BILLING_READ,
  },
  {
    to: "/support",
    label: "Support desk",
    icon: "SP",
    section: "Control",
    description: "Customer issues, cafe replies, and request history.",
    permission: ADMIN_PERMISSIONS.SUPPORT_MANAGE,
  },
  {
    to: "/admins",
    label: "Admins",
    icon: "AD",
    section: "Control",
    description: "Roles, access levels, and control room approvals.",
    permission: ADMIN_PERMISSIONS.ADMIN_ACCESS_MANAGE,
  },
  {
    to: "/businesses",
    label: "Businesses",
    icon: "CA",
    section: "Control",
    description: "Cafe profiles, commercial terms, payouts, and staff assignments.",
    permission: ADMIN_PERMISSIONS.ADMIN_ACCESS_MANAGE,
  },
  {
    to: "/settings",
    label: "Settings",
    icon: "SE",
    section: "Control",
    description: "Appearance and local workspace preferences.",
    permission: null,
  },
];

const NAV_SECTIONS = ["Overview", "Operations", "Experience", "Control"];

function formatRole(role) {
  return role === "super_admin" ? "Super Admin" : "Admin";
}

function formatStatus(status) {
  switch (String(status || "").toLowerCase()) {
    case "active":
      return "Active";
    case "pending":
      return "Pending";
    case "disabled":
      return "Disabled";
    default:
      return "Verified";
  }
}

function getStatusClassName(status) {
  switch (String(status || "").toLowerCase()) {
    case "pending":
      return "admin-layout__profile-status admin-layout__profile-status--pending";
    case "disabled":
      return "admin-layout__profile-status admin-layout__profile-status--disabled";
    default:
      return "admin-layout__profile-status admin-layout__profile-status--active";
  }
}

function AdminLayout({ children }) {
  const admin = getAdminProfile();
  const {
    businesses,
    selectedBusiness,
    selectedBusinessId,
    loading: businessesLoading,
    error: businessesError,
    selectBusiness,
  } = useAdminBusiness();
  const location = useLocation();
  const navItems = NAV_ITEMS.filter((item) => hasAdminPermission(item.permission, admin));
  const activeItem =
    navItems.find((item) => item.to === location.pathname) ||
    navItems.find((item) => location.pathname.startsWith(item.to)) ||
    navItems[0];

  const logout = async () => {
    try {
      await axios.post(`${API_BASE_URL}/admin/logout`, {});
    } catch (_) {
      // Clear local state even if the server session is already gone.
    } finally {
      clearAdminSession();
      window.location.href = "/";
    }
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-layout__sidebar-scroll">
          <div className="admin-layout__brand">
            <div className="admin-layout__brand-mark">GG</div>
            <div>
              <div className="admin-layout__brand-eyebrow">GameGrub Control</div>
              <div className="admin-layout__brand-title">Gaming Cafe OS</div>
              <div className="admin-layout__brand-copy">
                Design-system driven operations for booking, play, and billing.
              </div>
            </div>
          </div>

          <section className="admin-layout__nav-summary">
            <div className="admin-layout__nav-summary-label">Current view</div>
            <div className="admin-layout__nav-summary-title">
              {activeItem?.label || "Admin workspace"}
            </div>
            <div className="admin-layout__nav-summary-copy">
              {activeItem?.description || "Manage the floor from one calmer, clearer dashboard."}
            </div>
          </section>

          <section className="admin-layout__business-panel">
            <div className="admin-layout__business-label">Active cafe</div>
            <select
              className="admin-layout__business-select"
              value={selectedBusinessId || ""}
              onChange={(event) => selectBusiness(event.target.value)}
              disabled={businessesLoading || businesses.length === 0}
            >
              {businesses.length === 0 ? (
                <option value="">
                  {businessesLoading ? "Loading cafes..." : "No cafe access"}
                </option>
              ) : (
                businesses.map((business) => (
                  <option key={business.business_id} value={business.business_id}>
                    {business.name}
                  </option>
                ))
              )}
            </select>
            <div className="admin-layout__business-copy">
              {selectedBusiness?.tagline ||
                (businessesLoading
                  ? "Fetching your assigned cafe workspaces."
                  : "Choose the cafe workspace you want to manage.")}
            </div>
            {businessesError ? (
              <div className="admin-layout__business-error">{businessesError}</div>
            ) : null}
          </section>

          <div className="admin-layout__nav">
            {NAV_SECTIONS.map((section) => {
              const items = navItems.filter((item) => item.section === section);

              if (!items.length) {
                return null;
              }

              return (
                <div key={section} className="admin-layout__nav-group">
                  <div className="admin-layout__nav-group-label">{section}</div>
                  <nav className="admin-layout__nav-list">
                    {items.map((item) => (
                      <NavLink key={item.to} to={item.to} className="admin-nav-link">
                        {({ isActive }) => (
                          <div className={`admin-nav-item${isActive ? " is-active" : ""}`}>
                            <span className="admin-nav-item__icon">{item.icon}</span>
                            <span className="admin-nav-item__label">{item.label}</span>
                          </div>
                        )}
                      </NavLink>
                    ))}
                  </nav>
                </div>
              );
            })}
          </div>
        </div>

        <div className="admin-layout__sidebar-footer">
          <div className="admin-layout__profile-card">
            <div className="admin-layout__profile-copy">
              <div className="admin-layout__profile-name">{admin?.name || "Admin"}</div>
              <div className="admin-layout__profile-email">
                {admin?.email || "Secure admin access"}
              </div>
            </div>
            <div className={getStatusClassName(admin?.status)}>{formatStatus(admin?.status)}</div>
          </div>

          <button type="button" className="admin-action-button admin-layout__logout" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="admin-content">
        <section className="admin-layout__topbar">
          <div className="admin-layout__topbar-copy">
            <div className="admin-layout__topbar-label">Control room</div>
            <div className="admin-layout__topbar-title">{activeItem?.label || "Admin workspace"}</div>
            <div className="admin-layout__topbar-subtitle">
              {selectedBusiness
                ? `${selectedBusiness.name} | ${activeItem?.description || "Manage gaming-cafe operations from one shared system."}`
                : activeItem?.description || "Manage gaming-cafe operations from one shared system."}
            </div>
          </div>

          <div className="admin-layout__topbar-meta">
            {selectedBusiness ? <div className="dashboard-chip">{selectedBusiness.name}</div> : null}
            <div className="dashboard-chip">{formatRole(admin?.role)}</div>
            <div className={getStatusClassName(admin?.status)}>{formatStatus(admin?.status)}</div>
          </div>
        </section>

        <div className="admin-page">{children}</div>
      </main>
    </div>
  );
}

export default AdminLayout;
