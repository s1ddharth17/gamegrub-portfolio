import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

import AdminMetricCard from "../components/AdminMetricCard";
import AdminPageHero from "../components/AdminPageHero";
import AdminLayout from "../layout/AdminLayout";
import { API_BASE_URL } from "../config/api";
import { useAdminBusiness, withBusinessParams } from "../context/AdminBusinessContext";

const STATUSES = ["open", "assigned", "awaiting_customer", "resolved", "closed"];
const PRIORITIES = ["low", "normal", "high", "urgent"];

function formatLabel(value) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function SupportDesk() {
  const { selectedBusiness, selectedBusinessId, loading: businessLoading } = useAdminBusiness();
  const [statusFilter, setStatusFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [issues, setIssues] = useState([]);
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const selectedIssueIdRef = useRef(null);
  const [issue, setIssue] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reply, setReply] = useState("");
  const [internalReply, setInternalReply] = useState(false);
  const [draft, setDraft] = useState({ status: "open", priority: "normal", assigned_admin_id: "", resolution_summary: "" });

  const loadIssues = useCallback(async ({ preserveSelection = true } = {}) => {
    if (!selectedBusinessId) {
      setIssues([]);
      setIssue(null);
      setSelectedIssueId(null);
      setLoading(false);
      setError(businessLoading ? "" : "Select a cafe workspace to open support requests.");
      return;
    }
    try {
      setLoading(true);
      const [issuesResponse, assigneesResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/support/admin/issues`, {
          params: withBusinessParams(selectedBusinessId, { status: statusFilter, search: search.trim() || undefined }),
        }),
        axios.get(`${API_BASE_URL}/support/admin/assignees`, { params: { business_id: selectedBusinessId } }),
      ]);
      const nextIssues = Array.isArray(issuesResponse.data) ? issuesResponse.data : [];
      setIssues(nextIssues);
      setAssignees(Array.isArray(assigneesResponse.data) ? assigneesResponse.data : []);
      setError("");
      if (!preserveSelection || !nextIssues.some((row) => row.issue_id === selectedIssueIdRef.current)) {
        setSelectedIssueId(nextIssues[0]?.issue_id || null);
        setIssue(null);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.response?.data?.message || "Unable to load support requests.");
    } finally {
      setLoading(false);
    }
  }, [businessLoading, search, selectedBusinessId, statusFilter]);

  const loadIssue = useCallback(async (issueId) => {
    if (!issueId) {
      setIssue(null);
      return;
    }
    try {
      const response = await axios.get(`${API_BASE_URL}/support/admin/issues/${issueId}`);
      const nextIssue = response.data || null;
      setIssue(nextIssue);
      if (nextIssue) {
        setDraft({
          status: nextIssue.status || "open",
          priority: nextIssue.priority || "normal",
          assigned_admin_id: nextIssue.assigned_admin_id == null ? "" : String(nextIssue.assigned_admin_id),
          resolution_summary: nextIssue.resolution_summary || "",
        });
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.response?.data?.message || "Unable to load this support request.");
    }
  }, []);

  useEffect(() => { loadIssues({ preserveSelection: false }); }, [loadIssues]);
  useEffect(() => { loadIssue(selectedIssueId); }, [loadIssue, selectedIssueId]);
  useEffect(() => { selectedIssueIdRef.current = selectedIssueId; }, [selectedIssueId]);

  const refreshSelected = async () => {
    await loadIssues();
    await loadIssue(selectedIssueId);
  };

  const saveIssue = async () => {
    if (!issue) return;
    if (draft.status === "resolved" && !draft.resolution_summary.trim()) {
      setError("Add a resolution summary before resolving this request.");
      return;
    }
    setActionId("save");
    setError("");
    setNotice("");
    try {
      const response = await axios.put(`${API_BASE_URL}/support/admin/issues/${issue.issue_id}`, {
        status: draft.status,
        priority: draft.priority,
        assigned_admin_id: draft.assigned_admin_id || null,
        resolution_summary: draft.resolution_summary.trim() || null,
      });
      setIssue(response.data?.issue || null);
      setNotice("Support request updated and recorded in its audit history.");
      await loadIssues();
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.response?.data?.message || "Unable to update this request.");
    } finally {
      setActionId("");
    }
  };

  const addReply = async (event) => {
    event.preventDefault();
    const message = reply.trim();
    if (!issue || message.length < 2) return;
    setActionId("reply");
    setError("");
    setNotice("");
    try {
      const response = await axios.post(`${API_BASE_URL}/support/admin/issues/${issue.issue_id}/comments`, {
        message,
        internal: internalReply,
      });
      setIssue(response.data?.issue || null);
      setReply("");
      setNotice(internalReply ? "Private note added to the audit history." : "Reply sent to the customer.");
      await loadIssues();
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.response?.data?.message || "Unable to add this update.");
    } finally {
      setActionId("");
    }
  };

  const openCount = issues.filter((row) => ["open", "assigned", "awaiting_customer"].includes(row.status)).length;
  const urgentCount = issues.filter((row) => row.priority === "urgent" && !["resolved", "closed"].includes(row.status)).length;
  const panelStyle = { padding: 18, borderRadius: 18 };

  return (
    <AdminLayout>
      <AdminPageHero
        eyebrow="Customer care"
        title="Support desk"
        subtitle={selectedBusiness ? `Review customer requests and keep every update visible for ${selectedBusiness.name}.` : "Review and resolve cafe support requests."}
        chips={[`${openCount} active in this view`, `${urgentCount} urgent`, selectedBusiness?.name || "Select a cafe"]}
        badge={{ title: "Requests shown", value: String(issues.length), meta: "Cafe scoped", label: "Support" }}
        actions={<button type="button" className="admin-action-button" onClick={refreshSelected} disabled={loading || !selectedBusinessId}>{loading ? "Refreshing..." : "Refresh"}</button>}
      />

      <div className="admin-metric-grid">
        <AdminMetricCard icon="SUP" label="Requests" value={issues.length} hint="Matching this cafe and filter" tone="cool" />
        <AdminMetricCard icon="OPEN" label="Needs follow-up" value={openCount} hint="Open, assigned, or waiting on customer" tone={openCount ? "warm" : "success"} />
        <AdminMetricCard icon="URG" label="Urgent" value={urgentCount} hint="Active requests marked urgent" tone={urgentCount ? "danger" : "success"} />
      </div>

      {notice ? <div role="status" style={{ padding: 12, marginBottom: 12, borderRadius: 12, background: "var(--tone-success-bg)", color: "var(--tone-success-text)" }}>{notice}</div> : null}
      {error ? <div role="alert" style={{ padding: 12, marginBottom: 12, borderRadius: 12, background: "var(--tone-warning-bg)", color: "var(--tone-warning-text)" }}>{error}</div> : null}

      <div className="support-desk-grid">
        <section className="dashboard-panel admin-surface-hover" style={panelStyle} aria-label="Support request list">
          <div className="dashboard-panel__header" style={{ alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
            <div><div className="dashboard-panel__eyebrow">Cafe queue</div><div className="dashboard-panel__title">Customer requests</div></div>
            <select className="admin-search" aria-label="Filter support requests by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="open">Open</option><option value="assigned">Assigned</option><option value="awaiting_customer">Awaiting customer</option><option value="resolved">Resolved</option><option value="closed">Closed</option><option value="all">All statuses</option>
            </select>
          </div>
          <input className="admin-search" style={{ width: "100%", marginBottom: 12 }} aria-label="Search support requests" placeholder="Search request, customer, subject" value={search} onChange={(event) => setSearch(event.target.value)} />
          {loading ? <div className="admin-empty-state">Loading cafe requests...</div> : issues.length === 0 ? <div className="admin-empty-state">No support requests match this view.</div> : (
            <div style={{ display: "grid", gap: 9, maxHeight: 720, overflowY: "auto" }}>
              {issues.map((row) => (
                <button key={row.issue_id} type="button" onClick={() => setSelectedIssueId(row.issue_id)} aria-pressed={selectedIssueId === row.issue_id}
                  className="admin-panel-soft" style={{ textAlign: "left", cursor: "pointer", padding: 13, borderRadius: 13, border: selectedIssueId === row.issue_id ? "1px solid var(--accent-color, #61d9a7)" : "1px solid var(--border-subtle, rgba(255,255,255,.09))", background: selectedIssueId === row.issue_id ? "var(--surface-elevated, rgba(255,255,255,.06))" : "transparent", color: "inherit" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                    <strong>{row.subject}</strong><span className="admin-ops-chip">{formatLabel(row.priority)}</span>
                  </div>
                  <div className="admin-ops-row__meta" style={{ marginTop: 6 }}>{row.issue_number} · {row.customer_name || "Customer"} · {formatLabel(row.category)}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
                    <span className="admin-ops-chip admin-ops-chip--info">{formatLabel(row.status)}</span>
                    <small>{formatDateTime(row.updated_at)}</small>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-panel admin-surface-hover" style={panelStyle} aria-label="Support request details">
          {!issue ? <div className="admin-empty-state">Choose a request to read its history and respond.</div> : (
            <>
              <div className="dashboard-panel__header" style={{ gap: 10, flexWrap: "wrap" }}>
                <div><div className="dashboard-panel__eyebrow">{issue.issue_number} · {formatLabel(issue.category)}</div><div className="dashboard-panel__title">{issue.subject}</div><div className="admin-ops-row__meta">{issue.customer_name || "Customer"} · submitted {formatDateTime(issue.created_at)}</div></div>
                <span className="admin-ops-chip admin-ops-chip--info">{formatLabel(issue.status)}</span>
              </div>

              <div className="admin-panel-soft" style={{ padding: 14, borderRadius: 12, marginBottom: 14 }}>
                <div className="dashboard-panel__eyebrow">Customer description</div>
                <p style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{issue.description}</p>
                <div className="admin-ops-row__meta" style={{ marginTop: 10 }}>
                  {[issue.booking_id && `Booking #${issue.booking_id}`, issue.order_id && `Order #${issue.order_id}`, issue.bill_id && `Bill #${issue.bill_id}`].filter(Boolean).join(" · ") || "General cafe request"}
                </div>
              </div>

              <div className="admin-panel-soft" style={{ padding: 14, borderRadius: 12, marginBottom: 14 }}>
                <div className="dashboard-panel__eyebrow" style={{ marginBottom: 10 }}>Assignment and resolution</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                  <label className="admin-field"><span>Status</span><select className="admin-search" value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}>{STATUSES.map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}</select></label>
                  <label className="admin-field"><span>Priority</span><select className="admin-search" value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value }))}>{PRIORITIES.map((priority) => <option key={priority} value={priority}>{formatLabel(priority)}</option>)}</select></label>
                  <label className="admin-field"><span>Assigned to</span><select className="admin-search" value={draft.assigned_admin_id} onChange={(event) => setDraft((current) => ({ ...current, assigned_admin_id: event.target.value }))}><option value="">Unassigned</option>{assignees.map((admin) => <option key={admin.id} value={admin.id}>{admin.name} · {formatLabel(admin.role)}</option>)}</select></label>
                  <label className="admin-field" style={{ gridColumn: "1 / -1" }}><span>Resolution summary</span><textarea className="admin-search" rows={2} maxLength={1000} value={draft.resolution_summary} onChange={(event) => setDraft((current) => ({ ...current, resolution_summary: event.target.value }))} placeholder="Record the customer-facing outcome before resolving." /></label>
                </div>
                <button type="button" className="admin-action-button" style={{ marginTop: 10 }} disabled={Boolean(actionId)} onClick={saveIssue}>{actionId === "save" ? "Saving..." : "Save request changes"}</button>
              </div>

              <div className="dashboard-panel__eyebrow" style={{ marginBottom: 8 }}>Customer timeline and audit history</div>
              <div style={{ display: "grid", gap: 9, maxHeight: 350, overflowY: "auto", marginBottom: 14 }}>
                {(issue.events || []).length === 0 ? <div className="admin-empty-state">No timeline events yet.</div> : issue.events.map((event) => (
                  <article key={event.event_id} className="admin-panel-soft" style={{ padding: 12, borderRadius: 12, borderLeft: event.is_internal ? "3px solid #f4ad58" : "3px solid #55c8a3" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><strong>{event.is_internal ? "Private note" : formatLabel(event.event_type)}</strong><small>{formatDateTime(event.created_at)}</small></div>
                    <div className="admin-ops-row__meta">{event.actor_name || "GameGrub"}</div>
                    {event.message ? <p style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{event.message}</p> : null}
                  </article>
                ))}
              </div>

              {issue.status === "closed" ? <div className="admin-empty-state">This request is closed. Change its status to reopen it before replying.</div> : (
                <form onSubmit={addReply} className="admin-panel-soft" style={{ padding: 14, borderRadius: 12 }}>
                  <div className="dashboard-panel__eyebrow" style={{ marginBottom: 8 }}>Add update</div>
                  <textarea className="admin-search" rows={3} maxLength={3000} value={reply} onChange={(event) => setReply(event.target.value)} placeholder={internalReply ? "Add a private note for the cafe team..." : "Write a reply the customer can see..."} required />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 9 }}>
                    <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={internalReply} onChange={(event) => setInternalReply(event.target.checked)} />Private note, visible to cafe admins only</label>
                    <button type="submit" className="admin-action-button" disabled={Boolean(actionId) || reply.trim().length < 2}>{actionId === "reply" ? "Sending..." : internalReply ? "Add private note" : "Reply to customer"}</button>
                  </div>
                </form>
              )}
            </>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}

export default SupportDesk;
