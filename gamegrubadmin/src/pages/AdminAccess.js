import { useEffect, useMemo, useState } from "react";
import axios from "axios";

import AdminLayout from "../layout/AdminLayout";
import AdminMetricCard from "../components/AdminMetricCard";
import AdminPageHero from "../components/AdminPageHero";
import { getAdminProfile } from "../config/adminSession";

import { API_BASE_URL } from "../config/api";

const EMPTY_FORM = {
  name: "",
  email: "",
  password: "",
  role: "admin",
  status: "active",
};

function prettifyRole(role) {
  return role === "super_admin" ? "Super Admin" : "Child Admin";
}

function prettifyStatus(status) {
  switch (status) {
    case "active":
      return "Approved";
    case "pending":
      return "Pending";
    case "disabled":
      return "Disabled";
    default:
      return "Unknown";
  }
}

function formatDateTime(value) {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function AdminAccess() {
  const currentAdmin = getAdminProfile();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  const totals = useMemo(
    () =>
      admins.reduce(
        (summary, admin) => {
          summary.total += 1;
          if (admin.status === "active") summary.active += 1;
          if (admin.status === "pending") summary.pending += 1;
          if (admin.role === "super_admin") summary.superAdmins += 1;
          return summary;
        },
        { total: 0, active: 0, pending: 0, superAdmins: 0 }
      ),
    [admins]
  );

  const loadAdmins = async ({ resetBanners = false } = {}) => {
    try {
      if (resetBanners) {
        setError("");
        setNotice("");
      }

      const response = await axios.get(`${API_BASE_URL}/admin/access/list`);
      setAdmins(response.data);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not load admin accounts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  const handleCreateAdmin = async () => {
    if (!form.name || !form.email || !form.password) {
      setError("Name, email, and password are required.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setNotice("");

      await axios.post(`${API_BASE_URL}/admin/access/create`, form);
      setForm(EMPTY_FORM);
      setNotice("Admin account created successfully.");
      await loadAdmins();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not create admin account.");
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (adminId, status) => {
    try {
      setError("");
      setNotice("");
      await axios.put(`${API_BASE_URL}/admin/access/${adminId}/status`, { status });
      setNotice("Admin status updated.");
      await loadAdmins();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not update admin status.");
    }
  };

  const updateRole = async (adminId, role) => {
    try {
      setError("");
      setNotice("");
      await axios.put(`${API_BASE_URL}/admin/access/${adminId}/role`, { role });
      setNotice("Admin role updated.");
      await loadAdmins();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Could not update admin role.");
    }
  };

  return (
    <AdminLayout>
      <AdminPageHero
        eyebrow="Admin Access"
        title="Access Control"
        subtitle="Create more approved admins, keep child admins scoped, and make sure only verified staff can enter the control room."
        chips={[
          `${totals.active} approved admins`,
          `${totals.pending} pending approvals`,
          `${totals.superAdmins} super admins`,
        ]}
        badge={{
          title: "Signed-in owner",
          value: currentAdmin?.name || "Super Admin",
          meta: currentAdmin?.email || "Manage access from here",
          label: "Secure access",
        }}
        actions={
          <button type="button" className="admin-action-button" onClick={() => loadAdmins({ resetBanners: true })}>
            Refresh
          </button>
        }
      />

      <div className="admin-metric-grid">
        <AdminMetricCard icon="ADM" label="Total Admins" value={totals.total} hint="All admin accounts" tone="warm" />
        <AdminMetricCard icon="OK" label="Approved" value={totals.active} hint="Can log in now" tone="success" />
        <AdminMetricCard icon="PND" label="Pending" value={totals.pending} hint="Awaiting approval" tone="warning" />
        <AdminMetricCard icon="SUP" label="Super Admins" value={totals.superAdmins} hint="Can manage access" tone="cool" />
      </div>

      {error ? <div style={errorBanner}>{error}</div> : null}
      {notice ? <div style={successBanner}>{notice}</div> : null}

      <section className="admin-panel admin-surface-hover" style={panel}>
        <div style={sectionHeader}>
          <div>
            <h2 style={sectionTitle}>New admin</h2>
          </div>
        </div>

        <div className="admin-form-grid">
          <input
            placeholder="Full name"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
          />
          <input
            type="email"
            placeholder="Email address"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          />
          <input
            type="password"
            placeholder="Temporary password"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          />
          <select
            value={form.role}
            onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
          >
            <option value="admin">Child Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>
          <select
            value={form.status}
            onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="active">Approve Immediately</option>
            <option value="pending">Create as Pending</option>
            <option value="disabled">Create as Disabled</option>
          </select>
          <button type="button" className="admin-action-button" onClick={handleCreateAdmin} disabled={saving}>
            {saving ? "Creating..." : "Create Admin"}
          </button>
        </div>
      </section>

      <section className="admin-panel admin-surface-hover" style={panel}>
        <div style={sectionHeader}>
          <div>
            <h2 style={sectionTitle}>Admin team</h2>
          </div>
        </div>

        {loading ? (
          <div className="admin-empty-state">Loading admins...</div>
        ) : !admins.length ? (
          <div className="admin-empty-state">No admin accounts found.</div>
        ) : (
          <div style={cardGrid}>
            {admins.map((admin) => {
              const isCurrentAdmin = Number(admin.id) === Number(currentAdmin?.id);

              return (
                <article key={admin.id} className="admin-surface-hover" style={adminCard(admin.status)}>
                  <div style={cardTop}>
                    <div>
                      <div style={cardTitle}>
                        {admin.name}
                        {isCurrentAdmin ? <span style={selfBadge}>You</span> : null}
                      </div>
                      <div style={cardMeta}>{admin.email}</div>
                    </div>
                    <div style={statusChip(admin.status)}>{prettifyStatus(admin.status)}</div>
                  </div>

                  <div style={cardBody}>
                    <div style={detailRow}>
                      <span style={detailLabel}>Role</span>
                      <select
                        value={admin.role}
                        onChange={(event) => updateRole(admin.id, event.target.value)}
                        disabled={isCurrentAdmin}
                      >
                        <option value="admin">Child Admin</option>
                        <option value="super_admin">Super Admin</option>
                      </select>
                    </div>

                    <div style={detailRow}>
                      <span style={detailLabel}>Created</span>
                      <span>{formatDateTime(admin.created_at)}</span>
                    </div>

                    <div style={detailRow}>
                      <span style={detailLabel}>Last login</span>
                      <span>{formatDateTime(admin.last_login_at)}</span>
                    </div>

                    <div style={detailRow}>
                      <span style={detailLabel}>Approval</span>
                      <span>
                        {admin.approved_by_name
                          ? `${admin.approved_by_name} on ${formatDateTime(admin.approved_at)}`
                          : "Not approved yet"}
                      </span>
                    </div>

                    <div style={detailRow}>
                      <span style={detailLabel}>Type</span>
                      <span>{prettifyRole(admin.role)}</span>
                    </div>
                  </div>

                  <div style={actionRow}>
                    <button
                      type="button"
                      className="admin-action-button"
                      style={smallAction}
                      onClick={() => updateStatus(admin.id, "active")}
                      disabled={admin.status === "active" || isCurrentAdmin}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="admin-action-button"
                      style={secondaryAction}
                      onClick={() => updateStatus(admin.id, "pending")}
                      disabled={admin.status === "pending" || isCurrentAdmin}
                    >
                      Mark Pending
                    </button>
                    <button
                      type="button"
                      className="admin-action-button"
                      style={dangerAction}
                      onClick={() => updateStatus(admin.id, "disabled")}
                      disabled={admin.status === "disabled" || isCurrentAdmin}
                    >
                      Disable
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </AdminLayout>
  );
}

export default AdminAccess;

const panel = {
  padding: 24,
};

const sectionHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  marginBottom: 18,
};

const sectionTitle = {
  margin: 0,
  fontSize: 22,
  color: "var(--text)",
};

const errorBanner = {
  margin: "16px 0",
  padding: "14px 16px",
  borderRadius: 18,
  border: "1px solid var(--tone-danger-border)",
  background: "var(--tone-danger-bg)",
  color: "var(--tone-danger-text)",
};

const successBanner = {
  margin: "16px 0",
  padding: "14px 16px",
  borderRadius: 18,
  border: "1px solid var(--tone-success-border)",
  background: "var(--tone-success-bg)",
  color: "var(--tone-success-text)",
};

const cardGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 18,
};

const cardTop = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
};

const cardTitle = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 20,
  fontWeight: 700,
};

const selfBadge = {
  padding: "4px 9px",
  borderRadius: 999,
  background: "var(--tone-success-bg)",
  color: "var(--tone-success-text)",
  fontSize: 12,
  fontWeight: 700,
};

const cardMeta = {
  marginTop: 6,
  color: "var(--text-secondary)",
  wordBreak: "break-word",
};

const cardBody = {
  display: "grid",
  gap: 12,
  marginTop: 18,
};

const detailRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  color: "var(--text)",
};

const detailLabel = {
  minWidth: 84,
  color: "var(--text-secondary)",
};

const actionRow = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginTop: 18,
};

const smallAction = {
  padding: "10px 14px",
};

const secondaryAction = {
  padding: "10px 14px",
  background: "var(--surface-elevated)",
  borderColor: "var(--border)",
};

const dangerAction = {
  padding: "10px 14px",
  background: "var(--tone-danger-bg)",
  borderColor: "var(--tone-danger-border)",
  color: "var(--tone-danger-text)",
};

function adminCard(status) {
  const borderColor =
    status === "active"
      ? "var(--tone-success-border)"
      : status === "pending"
        ? "var(--tone-gold-border)"
        : "var(--tone-danger-border)";

  return {
    padding: 20,
    borderRadius: 24,
    border: `1px solid ${borderColor}`,
    background: "linear-gradient(180deg, var(--surface), var(--surface-elevated))",
    boxShadow: "var(--shadow-md)",
  };
}

function statusChip(status) {
  const palette =
    status === "active"
      ? {
          background: "var(--tone-success-bg)",
          borderColor: "var(--tone-success-border)",
          color: "var(--tone-success-text)",
        }
      : status === "pending"
        ? {
            background: "var(--tone-gold-bg)",
            borderColor: "var(--tone-gold-border)",
            color: "var(--tone-gold-text)",
          }
        : {
            background: "var(--tone-danger-bg)",
            borderColor: "var(--tone-danger-border)",
            color: "var(--tone-danger-text)",
          };

  return {
    padding: "7px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    border: "1px solid transparent",
    ...palette,
  };
}
