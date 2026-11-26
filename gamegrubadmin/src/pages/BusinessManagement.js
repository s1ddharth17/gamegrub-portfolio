import { useEffect, useMemo, useState } from "react";
import axios from "axios";

import AdminLayout from "../layout/AdminLayout";
import AdminPageHero from "../components/AdminPageHero";
import { API_BASE_URL } from "../config/api";
import { useAdminBusiness } from "../context/AdminBusinessContext";

const EMPTY_BUSINESS = {
  name: "",
  slug: "",
  tagline: "",
  description: "",
  city: "",
  state: "",
  address_line1: "",
  address_line2: "",
  postal_code: "",
  latitude: "",
  longitude: "",
  phone: "",
  contact_email: "",
  timezone: "Asia/Kolkata",
  status: "pending",
  listing_status: "hidden",
  is_featured: false,
  opens_at: "",
  closes_at: "",
  logo_image: "",
  cover_image: "",
  amenities: "",
  equipment_highlights: "",
  gallery_images: "",
  parking_info: "",
  accessibility_info: "",
  policies: "",
  commission_rate: 0,
  convenience_fee_flat: 0,
  convenience_fee_rate: 0,
};
const EMPTY_PAYOUT = {
  payout_method: "manual",
  payout_schedule: "manual",
  minimum_payout_amount: 0,
};

function apiError(error, fallback) {
  return error.response?.data?.message || error.response?.data?.error || fallback;
}

function timeInput(value) {
  return value ? String(value).slice(0, 5) : "";
}

function listInput(value) {
  return Array.isArray(value) ? value.join("\n") : "";
}

function listPayload(value) {
  return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function Field({ label, children, className = "" }) {
  return (
    <label className={`business-manager__field ${className}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function BusinessManagement() {
  const { refreshBusinesses, selectBusiness } = useAdminBusiness();
  const [businesses, setBusinesses] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(EMPTY_BUSINESS);
  const [payout, setPayout] = useState(EMPTY_PAYOUT);
  const [staff, setStaff] = useState([]);
  const [audit, setAudit] = useState([]);
  const [assignee, setAssignee] = useState("");
  const [assigneeRole, setAssigneeRole] = useState("manager");
  const [assigneeStatus, setAssigneeStatus] = useState("active");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedBusiness = useMemo(
    () => businesses.find((business) => Number(business.business_id) === Number(selectedId)) || null,
    [businesses, selectedId]
  );

  const loadBusinesses = async (preferredId = selectedId) => {
    const response = await axios.get(`${API_BASE_URL}/admin/businesses`);
    const rows = Array.isArray(response.data) ? response.data : [];
    setBusinesses(rows);
    const nextId = rows.some((row) => Number(row.business_id) === Number(preferredId))
      ? Number(preferredId)
      : rows[0]?.business_id || null;
    setSelectedId(nextId);
    return nextId;
  };

  const loadBusiness = async (businessId) => {
    if (!businessId) return;
    try {
      const [detailResponse, staffResponse, auditResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/admin/businesses/${businessId}`),
        axios.get(`${API_BASE_URL}/admin/businesses/${businessId}/staff`),
        axios.get(`${API_BASE_URL}/admin/businesses/${businessId}/audit`),
      ]);
      setForm({ ...EMPTY_BUSINESS, ...detailResponse.data.business,
        opens_at: timeInput(detailResponse.data.business?.opens_at),
        closes_at: timeInput(detailResponse.data.business?.closes_at),
        amenities: listInput(detailResponse.data.business?.amenities),
        equipment_highlights: listInput(detailResponse.data.business?.equipment_highlights),
        gallery_images: listInput(detailResponse.data.business?.gallery_images),
      });
      setPayout({ ...EMPTY_PAYOUT, ...detailResponse.data.payout_settings });
      setStaff(Array.isArray(staffResponse.data) ? staffResponse.data : []);
      setAudit(Array.isArray(auditResponse.data) ? auditResponse.data : []);
      setError("");
    } catch (requestError) {
      setError(apiError(requestError, "Could not load this cafe's configuration."));
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const listResponse = await axios.get(`${API_BASE_URL}/admin/businesses`);
        if (!active) return;
        const rows = Array.isArray(listResponse.data) ? listResponse.data : [];
        setBusinesses(rows);
        setSelectedId(rows[0]?.business_id || null);
      } catch (requestError) {
        if (active) setError(apiError(requestError, "Could not load business administration."));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (selectedId) loadBusiness(selectedId);
  }, [selectedId]);

  const resetForNew = () => {
    setSelectedId(null);
    setForm(EMPTY_BUSINESS);
    setPayout(EMPTY_PAYOUT);
    setStaff([]);
    setAudit([]);
    setNotice("");
    setError("");
  };

  const saveBusiness = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Cafe name is required.");
      return;
    }
    try {
      setSaving(true);
      setError("");
      setNotice("");
      const payload = {
        ...form,
        amenities: listPayload(form.amenities),
        equipment_highlights: listPayload(form.equipment_highlights),
        gallery_images: listPayload(form.gallery_images),
        payout_settings: payout,
      };
      const response = selectedId
        ? await axios.put(`${API_BASE_URL}/admin/businesses/${selectedId}`, payload)
        : await axios.post(`${API_BASE_URL}/admin/businesses`, payload);
      const savedId = Number(response.data.business.business_id);
      await loadBusinesses(savedId);
      await refreshBusinesses();
      selectBusiness(savedId);
      setNotice(selectedId ? "Cafe configuration saved." : "Cafe onboarded successfully.");
      setSelectedId(savedId);
      await loadBusiness(savedId);
    } catch (requestError) {
      setError(apiError(requestError, "Could not save cafe configuration."));
    } finally {
      setSaving(false);
    }
  };

  const saveMembership = async (adminId, role, status) => {
    if (!selectedId) return;
    try {
      setError("");
      setNotice("");
      await axios.put(`${API_BASE_URL}/admin/businesses/${selectedId}/staff/${adminId}`, { role, status });
      await loadBusiness(selectedId);
      await loadBusinesses(selectedId);
      setNotice("Cafe staff assignment saved.");
    } catch (requestError) {
      setError(apiError(requestError, "Could not update cafe staff."));
    }
  };

  const currentStaff = staff.filter((member) => member.membership_id);
  const unassignedAdmins = staff.filter((member) => !member.membership_id);

  return (
    <AdminLayout>
      <AdminPageHero
        eyebrow="Cafe Operations"
        title="Business onboarding"
        subtitle="Configure public profiles, operating details, commercial terms, payout rules, and cafe staff from one place."
        chips={[`${businesses.length} cafes`, `${currentStaff.length} assigned staff`, "Super admin control"]}
        actions={
          <div className="business-manager__hero-actions">
            <button type="button" className="admin-action-button" onClick={() => loadBusinesses().catch((e) => setError(apiError(e, "Could not refresh cafes.")))}>Refresh</button>
            <button type="button" className="admin-action-button business-manager__secondary" onClick={resetForNew}>New cafe</button>
          </div>
        }
      />

      {error ? <div className="business-manager__banner business-manager__banner--error">{error}</div> : null}
      {notice ? <div className="business-manager__banner business-manager__banner--success">{notice}</div> : null}

      <div className="business-manager__columns">
        <aside className="admin-panel business-manager__list">
          <div className="business-manager__section-heading">
            <div><p className="business-manager__eyebrow">Platform directory</p><h2>Cafes</h2></div>
            <span className="business-manager__count">{businesses.length}</span>
          </div>
          {loading ? <div className="admin-empty-state">Loading cafes…</div> : businesses.length ? (
            <div className="business-manager__business-list">
              {businesses.map((business) => (
                <button
                  type="button"
                  key={business.business_id}
                  onClick={() => { setNotice(""); setSelectedId(Number(business.business_id)); }}
                  className={`business-manager__business-option ${Number(selectedId) === Number(business.business_id) ? "is-selected" : ""}`}
                >
                  <span className="business-manager__business-name">{business.name}</span>
                  <span className="business-manager__business-meta">{[business.city, business.state].filter(Boolean).join(", ") || business.slug}</span>
                  <span className="business-manager__business-tags"><i>{business.status}</i><i>{business.listing_status}</i></span>
                </button>
              ))}
            </div>
          ) : <div className="admin-empty-state">No cafes yet. Create the first cafe profile.</div>}
        </aside>

        <main className="business-manager__main">
          <form className="admin-panel business-manager__panel" onSubmit={saveBusiness}>
            <div className="business-manager__section-heading">
              <div>
                <p className="business-manager__eyebrow">{selectedBusiness ? `Cafe ${selectedId}` : "Onboarding"}</p>
                <h2>{selectedBusiness ? selectedBusiness.name : "New cafe profile"}</h2>
              </div>
              <button className="admin-action-button" type="submit" disabled={saving || loading}>
                {saving ? "Saving…" : selectedId ? "Save configuration" : "Create cafe"}
              </button>
            </div>

            <div className="business-manager__form-grid">
              <Field label="Cafe name"><input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
              <Field label="Public URL slug"><input value={form.slug || ""} placeholder="Generated from cafe name" onChange={(e) => setForm({ ...form, slug: e.target.value })} /></Field>
              <Field label="Tagline"><input value={form.tagline || ""} onChange={(e) => setForm({ ...form, tagline: e.target.value })} /></Field>
              <Field label="Contact email"><input type="email" value={form.contact_email || ""} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></Field>
              <Field label="Phone"><input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              <Field label="Address"><input value={form.address_line1 || ""} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} /></Field>
              <Field label="Address line 2"><input value={form.address_line2 || ""} onChange={(e) => setForm({ ...form, address_line2: e.target.value })} /></Field>
              <Field label="City"><input value={form.city || ""} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
              <Field label="State"><input value={form.state || ""} onChange={(e) => setForm({ ...form, state: e.target.value })} /></Field>
              <Field label="Postal code"><input value={form.postal_code || ""} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} /></Field>
              <Field label="Map latitude"><input type="number" min="-90" max="90" step="0.0000001" value={form.latitude ?? ""} onChange={(e) => setForm({ ...form, latitude: e.target.value })} /></Field>
              <Field label="Map longitude"><input type="number" min="-180" max="180" step="0.0000001" value={form.longitude ?? ""} onChange={(e) => setForm({ ...form, longitude: e.target.value })} /></Field>
              <Field label="Time zone"><input value={form.timezone || "Asia/Kolkata"} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="Asia/Kolkata" /></Field>
              <Field label="Opens at"><input type="time" value={timeInput(form.opens_at)} onChange={(e) => setForm({ ...form, opens_at: e.target.value })} /></Field>
              <Field label="Closes at"><input type="time" value={timeInput(form.closes_at)} onChange={(e) => setForm({ ...form, closes_at: e.target.value })} /></Field>
              <Field label="Operational status"><select value={form.status || "pending"} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="draft">Draft</option><option value="pending">Pending</option><option value="active">Active</option><option value="suspended">Suspended</option></select></Field>
              <Field label="Public listing"><select value={form.listing_status || "hidden"} onChange={(e) => setForm({ ...form, listing_status: e.target.value })}><option value="hidden">Hidden</option><option value="coming_soon">Coming soon</option><option value="listed">Listed</option></select></Field>
              <Field label="Logo image URL"><input value={form.logo_image || ""} onChange={(e) => setForm({ ...form, logo_image: e.target.value })} /></Field>
              <Field label="Cover image URL"><input value={form.cover_image || ""} onChange={(e) => setForm({ ...form, cover_image: e.target.value })} /></Field>
              <Field label="Description" className="business-manager__span-two"><textarea rows="4" value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
              <Field label="Amenities (one per line)"><textarea rows="4" value={form.amenities || ""} onChange={(e) => setForm({ ...form, amenities: e.target.value })} placeholder="Air conditioning&#10;Food counter&#10;Wi-Fi" /></Field>
              <Field label="Equipment highlights (one per line)"><textarea rows="4" value={form.equipment_highlights || ""} onChange={(e) => setForm({ ...form, equipment_highlights: e.target.value })} placeholder="240 Hz monitors&#10;Mechanical keyboards" /></Field>
              <Field label="Gallery image URLs (one per line)"><textarea rows="4" value={form.gallery_images || ""} onChange={(e) => setForm({ ...form, gallery_images: e.target.value })} placeholder="https://… or /uploads/…" /></Field>
              <Field label="Parking information" className="business-manager__span-two"><textarea rows="3" value={form.parking_info || ""} onChange={(e) => setForm({ ...form, parking_info: e.target.value })} /></Field>
              <Field label="Accessibility information" className="business-manager__span-two"><textarea rows="3" value={form.accessibility_info || ""} onChange={(e) => setForm({ ...form, accessibility_info: e.target.value })} /></Field>
              <Field label="Cafe policies" className="business-manager__span-two"><textarea rows="4" value={form.policies || ""} onChange={(e) => setForm({ ...form, policies: e.target.value })} placeholder="House rules, age restrictions, or booking guidance" /></Field>
              <label className="business-manager__check"><input type="checkbox" checked={Boolean(form.is_featured)} onChange={(e) => setForm({ ...form, is_featured: e.target.checked })} /> Feature this cafe in discovery</label>
            </div>
            <p className="business-manager__helper">To publish a cafe, provide its full street address, city and state, a valid phone number or contact email, and opening and closing hours. Map coordinates are optional.</p>

            <div className="business-manager__subsection">
              <div><p className="business-manager__eyebrow">Commercial settings</p><h3>Fees and payouts</h3></div>
              <div className="business-manager__form-grid">
                <Field label="Platform commission (%)"><input type="number" min="0" max="100" step="0.01" value={form.commission_rate ?? 0} onChange={(e) => setForm({ ...form, commission_rate: e.target.value })} /></Field>
                <Field label="Convenience fee (flat)"><input type="number" min="0" step="0.01" value={form.convenience_fee_flat ?? 0} onChange={(e) => setForm({ ...form, convenience_fee_flat: e.target.value })} /></Field>
                <Field label="Convenience fee (%)"><input type="number" min="0" max="100" step="0.01" value={form.convenience_fee_rate ?? 0} onChange={(e) => setForm({ ...form, convenience_fee_rate: e.target.value })} /></Field>
                <Field label="Payout method"><select value={payout.payout_method} onChange={(e) => setPayout({ ...payout, payout_method: e.target.value })}><option value="manual">Manual</option><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option></select></Field>
                <Field label="Payout schedule"><select value={payout.payout_schedule} onChange={(e) => setPayout({ ...payout, payout_schedule: e.target.value })}><option value="manual">On request</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></Field>
                <Field label="Minimum payout amount"><input type="number" min="0" step="0.01" value={payout.minimum_payout_amount ?? 0} onChange={(e) => setPayout({ ...payout, minimum_payout_amount: e.target.value })} /></Field>
              </div>
            </div>
          </form>

          {selectedId ? (
            <section className="admin-panel business-manager__panel">
              <div className="business-manager__section-heading">
                <div><p className="business-manager__eyebrow">Cafe access</p><h2>Staff assignments</h2></div>
              </div>
              <div className="business-manager__assign-row">
                <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">Choose an admin</option>
                  {unassignedAdmins.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.email}</option>)}
                </select>
                <select value={assigneeRole} onChange={(e) => setAssigneeRole(e.target.value)}><option value="owner">Owner</option><option value="manager">Manager</option><option value="kitchen">Kitchen</option><option value="tournament_manager">Tournament manager</option></select>
                <select value={assigneeStatus} onChange={(e) => setAssigneeStatus(e.target.value)}><option value="active">Active</option><option value="pending">Pending</option><option value="invited">Invited</option><option value="disabled">Disabled</option></select>
                <button type="button" className="admin-action-button" disabled={!assignee} onClick={async () => { await saveMembership(assignee, assigneeRole, assigneeStatus); setAssignee(""); }}>Assign</button>
              </div>
              {currentStaff.length ? (
                <div className="business-manager__staff-list">
                  {currentStaff.map((member) => (
                    <StaffAssignment key={member.id} member={member} onSave={saveMembership} />
                  ))}
                </div>
              ) : <div className="admin-empty-state">No staff assigned to this cafe yet.</div>}
            </section>
          ) : null}

          {selectedId ? (
            <section className="admin-panel business-manager__panel">
              <div className="business-manager__section-heading"><div><p className="business-manager__eyebrow">Change history</p><h2>Audit log</h2></div></div>
              {audit.length ? <div className="business-manager__audit-list">
                {audit.map((entry) => <article key={entry.audit_id} className="business-manager__audit-entry">
                  <div className="business-manager__audit-meta"><strong>{entry.action}</strong><span>{entry.actor_name || "System admin"} · {formatDate(entry.created_at)}</span></div>
                  <details><summary>View recorded changes</summary><pre>{JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}</pre></details>
                </article>)}
              </div> : <div className="admin-empty-state">No configuration changes recorded yet.</div>}
            </section>
          ) : null}
        </main>
      </div>
    </AdminLayout>
  );
}

function StaffAssignment({ member, onSave }) {
  const [role, setRole] = useState(member.membership_role || "manager");
  const [status, setStatus] = useState(member.membership_status || "active");
  const [saving, setSaving] = useState(false);
  return (
    <div className="business-manager__staff-row">
      <div className="business-manager__staff-identity"><strong>{member.name}</strong><span>{member.email} · account {member.admin_status}</span></div>
      <select value={role} onChange={(e) => setRole(e.target.value)}><option value="owner">Owner</option><option value="manager">Manager</option><option value="kitchen">Kitchen</option><option value="tournament_manager">Tournament manager</option></select>
      <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Active</option><option value="pending">Pending</option><option value="invited">Invited</option><option value="disabled">Disabled</option></select>
      <button type="button" className="admin-action-button business-manager__secondary" disabled={saving} onClick={async () => { setSaving(true); await onSave(member.id, role, status); setSaving(false); }}>{saving ? "Saving…" : "Save"}</button>
    </div>
  );
}

export default BusinessManagement;
