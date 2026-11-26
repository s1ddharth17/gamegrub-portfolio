import { useCallback, useEffect, useState } from "react";
import axios from "axios";

import AdminMetricCard from "../components/AdminMetricCard";
import AdminPageHero from "../components/AdminPageHero";
import AdminLayout from "../layout/AdminLayout";
import { API_BASE_URL } from "../config/api";
import { useAdminBusiness, withBusinessParams } from "../context/AdminBusinessContext";

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateTime(value) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

const REASON_LABELS = {
  missing_payment_receipt: "Payment has no receipt number",
  captured_ledger_mismatch: "Captured total does not match the transaction ledger",
  gateway_ledger_mismatch: "Razorpay capture does not match the gateway ledger",
  refund_ledger_mismatch: "Refund total does not match the transaction ledger",
  refund_in_progress: "Refund is waiting for a final outcome",
  refund_failed: "A refund failed and needs action",
  expired_checkout_attempt: "A checkout attempt expired without a terminal update",
  provider_review_required: "Provider captured a payment after the booking changed",
};

function FinanceOperations() {
  const { selectedBusiness, selectedBusinessId, loading: businessLoading } = useAdminBusiness();
  const [tab, setTab] = useState("refunds");
  const [refundStatus, setRefundStatus] = useState("open");
  const [reconciliationStatus, setReconciliationStatus] = useState("unresolved");
  const [method, setMethod] = useState("all");
  const [refunds, setRefunds] = useState([]);
  const [reconciliation, setReconciliation] = useState([]);
  const [notes, setNotes] = useState({});
  const [references, setReferences] = useState({});
  const [adjustments, setAdjustments] = useState({});
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async () => {
    if (!selectedBusinessId) {
      setRefunds([]);
      setReconciliation([]);
      setLoading(false);
      setError(businessLoading ? "" : "Select a cafe workspace to open finance operations.");
      return;
    }
    try {
      setLoading(true);
      const [refundResponse, reconciliationResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/admin/settlements/refunds`, {
          params: withBusinessParams(selectedBusinessId, { status: refundStatus }),
        }),
        axios.get(`${API_BASE_URL}/admin/settlements/reconciliation`, {
          params: withBusinessParams(selectedBusinessId, { status: reconciliationStatus, method }),
        }),
      ]);
      setRefunds(refundResponse.data || []);
      setReconciliation(reconciliationResponse.data || []);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to load finance records.");
    } finally {
      setLoading(false);
    }
  }, [businessLoading, method, reconciliationStatus, refundStatus, selectedBusinessId]);

  useEffect(() => { loadData(); }, [loadData]);

  const updateRefund = async (refund, action) => {
    const note = String(notes[refund.refund_id] || "").trim();
    const reference = String(references[refund.refund_id] || "").trim();
    if (action === "reject" && !note) {
      setError("Add the reason before declining a refund.");
      return;
    }
    if (action === "process" && refund.refund_method !== "razorpay" && (!note || !reference)) {
      setError("Offline refunds need an audit note and transfer reference.");
      return;
    }
    setActionId(refund.refund_id);
    setError("");
    try {
      const response = await axios.post(
        `${API_BASE_URL}/admin/settlements/refunds/${refund.refund_id}/process`,
        { action, note, reference },
      );
      setNotice(response.data?.message || "Refund updated.");
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to update refund.");
    } finally {
      setActionId("");
    }
  };

  const saveNote = async (row) => {
    const note = String(notes[`payment-${row.payment_id}`] || "").trim();
    if (!note) return setError("Enter an audit note first.");
    setActionId(`note-${row.payment_id}`);
    try {
      await axios.post(`${API_BASE_URL}/admin/settlements/reconciliation/notes`, {
        business_id: selectedBusinessId,
        entity_type: "payment",
        entity_id: String(row.payment_id),
        note,
      });
      setNotice(`Audit note saved for payment ${row.payment_id}.`);
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to save audit note.");
    } finally {
      setActionId("");
    }
  };

  const recordAdjustment = async (row) => {
    const draft = adjustments[row.payment_id] || {};
    if (!draft.amount || !draft.reference || !draft.note) {
      setError("Adjustment requires an amount, reference, and audit note.");
      return;
    }
    setActionId(`adjust-${row.payment_id}`);
    try {
      await axios.post(`${API_BASE_URL}/admin/settlements/reconciliation/adjustments`, {
        payment_id: row.payment_id,
        amount: Number(draft.amount),
        channel: draft.channel || "manual",
        reference: draft.reference,
        note: draft.note,
      });
      setNotice(`Adjustment recorded for payment ${row.payment_id}.`);
      await loadData();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to record adjustment.");
    } finally {
      setActionId("");
    }
  };

  const unresolvedCount = reconciliation.filter((row) => row.unresolved).length;
  const unresolvedRefunds = refunds.filter((refund) => ["requested", "processing", "failed"].includes(refund.status)).length;
  const inputStyle = { minWidth: 150, flex: "1 1 170px" };

  return (
    <AdminLayout>
      <AdminPageHero
        eyebrow="Finance operations"
        title="Refunds & reconciliation"
        subtitle={selectedBusiness ? `Resolve refunds and payment differences for ${selectedBusiness.name}.` : "Resolve refund requests and investigate payment differences."}
        chips={[`${unresolvedRefunds} open refund requests`, `${unresolvedCount} unresolved payment records`, selectedBusiness?.name || "Select a cafe"]}
        badge={{ title: "Finance queue", value: String(unresolvedRefunds + unresolvedCount), meta: "Items needing review", label: "Payments" }}
        actions={<button type="button" className="admin-action-button" onClick={loadData} disabled={loading || !selectedBusinessId}>{loading ? "Refreshing..." : "Refresh"}</button>}
      />

      <div className="admin-metric-grid">
        <AdminMetricCard icon="REF" label="Refund queue" value={refunds.length} hint="Requests and processing outcomes" tone="warm" />
        <AdminMetricCard icon="MIS" label="Unresolved mismatches" value={unresolvedCount} hint="Ledger, gateway, and receipt checks" tone={unresolvedCount ? "danger" : "success"} />
        <AdminMetricCard icon="AUD" label="Payment channels" value="Gateway · cash · UPI" hint="Operator adjustments are audited" tone="cool" />
      </div>

      <div className="admin-panel-soft" style={{ display: "flex", gap: 8, padding: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <button className="admin-action-button" style={{ opacity: tab === "refunds" ? 1 : 0.62 }} onClick={() => setTab("refunds")}>Refund requests</button>
        <button className="admin-action-button" style={{ opacity: tab === "reconciliation" ? 1 : 0.62 }} onClick={() => setTab("reconciliation")}>Reconciliation</button>
      </div>

      {notice ? <div role="status" style={{ padding: 12, marginBottom: 10, borderRadius: 12, background: "var(--tone-success-bg)", color: "var(--tone-success-text)" }}>{notice}</div> : null}
      {error ? <div role="alert" style={{ padding: 12, marginBottom: 10, borderRadius: 12, background: "var(--tone-warning-bg)", color: "var(--tone-warning-text)" }}>{error}</div> : null}

      {tab === "refunds" ? (
        <section className="dashboard-panel dashboard-panel--full admin-surface-hover">
          <div className="dashboard-panel__header">
            <div><div className="dashboard-panel__eyebrow">Customer refunds</div><div className="dashboard-panel__title">Review and process requests</div></div>
            <select className="admin-search" value={refundStatus} onChange={(event) => setRefundStatus(event.target.value)}>
              <option value="open">Open requests</option><option value="all">All outcomes</option>
            </select>
          </div>
          {loading ? <div className="admin-empty-state">Loading refund requests...</div> : refunds.length === 0 ? <div className="admin-empty-state">No refund requests in this view.</div> : (
            <div className="admin-ops-list">
              {refunds.map((refund) => (
                <article className="admin-ops-row admin-surface-hover" key={refund.refund_id}>
                  <div className="admin-ops-row__primary">
                    <div className="admin-ops-row__identity">
                      <div className="admin-ops-row__avatar">RF</div>
                      <div>
                        <div className="admin-ops-row__eyebrow">{refund.refund_number} · Booking #{refund.booking_id}{refund.order_id ? ` · Order #${refund.order_id}` : " · Booking cancellation"}</div>
                        <div className="admin-ops-row__title">{refund.user_name || "Customer"} · {formatCurrency(refund.requested_amount)}</div>
                        <div className="admin-ops-row__meta">{refund.reason || "No reason provided"} · {formatDateTime(refund.requested_at)}</div>
                      </div>
                    </div>
                    <div className="admin-ops-chip-group">
                      <span className="admin-ops-chip">{refund.refund_method}</span>
                      <span className={`admin-ops-chip ${refund.status === "failed" ? "admin-ops-chip--warning" : "admin-ops-chip--info"}`}>{refund.status}</span>
                      <span className="admin-ops-chip">{refund.payment_receipt_number || "No payment receipt"}</span>
                    </div>
                  </div>
                  {refund.outcome_message ? <p className="dashboard-panel__subtitle">{refund.outcome_message}{refund.failure_description ? ` ${refund.failure_description}` : ""}</p> : null}
                  {["requested", "failed"].includes(refund.status) ? (
                    <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                      <input className="admin-search" style={inputStyle} placeholder="Audit note / decline reason" value={notes[refund.refund_id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [refund.refund_id]: event.target.value }))} />
                      {refund.refund_method !== "razorpay" ? <input className="admin-search" style={inputStyle} placeholder="Transfer reference" value={references[refund.refund_id] || ""} onChange={(event) => setReferences((current) => ({ ...current, [refund.refund_id]: event.target.value }))} /> : null}
                      <button type="button" className="admin-action-button" disabled={Boolean(actionId)} onClick={() => updateRefund(refund, "process")}>{actionId === refund.refund_id ? "Saving..." : refund.refund_method === "razorpay" ? "Process Razorpay refund" : "Record offline refund"}</button>
                      <button type="button" className="admin-action-button" disabled={Boolean(actionId)} onClick={() => updateRefund(refund, "reject")}>Decline</button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="dashboard-panel dashboard-panel--full admin-surface-hover">
          <div className="dashboard-panel__header">
            <div><div className="dashboard-panel__eyebrow">Payment ledger</div><div className="dashboard-panel__title">Investigate unresolved records</div></div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select className="admin-search" value={reconciliationStatus} onChange={(event) => setReconciliationStatus(event.target.value)}><option value="unresolved">Unresolved only</option><option value="all">All payments</option></select>
              <select className="admin-search" value={method} onChange={(event) => setMethod(event.target.value)}><option value="all">All methods</option><option value="razorpay">Razorpay</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="wallet">Wallet</option><option value="manual">Manual</option></select>
            </div>
          </div>
          {loading ? <div className="admin-empty-state">Loading payment reconciliation...</div> : reconciliation.length === 0 ? <div className="admin-empty-state">No payment mismatches in this view.</div> : (
            <div className="admin-ops-list">
              {reconciliation.map((row) => {
                const adjustment = adjustments[row.payment_id] || { channel: "manual" };
                return (
                  <article className="admin-ops-row admin-surface-hover" key={row.payment_id}>
                    <div className="admin-ops-row__primary">
                      <div className="admin-ops-row__identity">
                        <div className="admin-ops-row__avatar">{row.payment_method?.slice(0, 2)?.toUpperCase() || "PM"}</div>
                        <div>
                          <div className="admin-ops-row__eyebrow">Payment #{row.payment_id} · Booking #{row.booking_id} · {row.receipt_number || "Missing receipt"}</div>
                          <div className="admin-ops-row__title">{row.user_name || "Customer"} · {row.payment_method || "Unassigned"} · {formatCurrency(row.captured_amount)}</div>
                          <div className="admin-ops-row__meta">Captured ledger {formatCurrency(row.ledger_captured)} · Razorpay {formatCurrency(row.gateway_captured)} · Refunded {formatCurrency(row.refunded_amount)} · {formatDateTime(row.created_at)}</div>
                        </div>
                      </div>
                      <div className="admin-ops-chip-group">{row.reasons.map((reason) => <span key={reason} className="admin-ops-chip admin-ops-chip--warning">{REASON_LABELS[reason] || reason}</span>)}</div>
                    </div>
                    {row.last_audit_note ? <p className="dashboard-panel__subtitle">Latest audit note: {row.last_audit_note}</p> : null}
                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                      <input className="admin-search" style={inputStyle} placeholder="Add audit note" value={notes[`payment-${row.payment_id}`] || ""} onChange={(event) => setNotes((current) => ({ ...current, [`payment-${row.payment_id}`]: event.target.value }))} />
                      <button type="button" className="admin-action-button" disabled={Boolean(actionId)} onClick={() => saveNote(row)}>Save audit note</button>
                    </div>
                    <details style={{ marginTop: 10 }}>
                      <summary>Record an operator adjustment</summary>
                      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                        <input className="admin-search" style={inputStyle} placeholder="Amount (+/-)" value={adjustment.amount || ""} onChange={(event) => setAdjustments((current) => ({ ...current, [row.payment_id]: { ...adjustment, amount: event.target.value } }))} />
                        <select className="admin-search" value={adjustment.channel} onChange={(event) => setAdjustments((current) => ({ ...current, [row.payment_id]: { ...adjustment, channel: event.target.value } }))}><option value="manual">Manual</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="wallet">Wallet</option></select>
                        <input className="admin-search" style={inputStyle} placeholder="Reference" value={adjustment.reference || ""} onChange={(event) => setAdjustments((current) => ({ ...current, [row.payment_id]: { ...adjustment, reference: event.target.value } }))} />
                        <input className="admin-search" style={inputStyle} placeholder="Why is this adjustment needed?" value={adjustment.note || ""} onChange={(event) => setAdjustments((current) => ({ ...current, [row.payment_id]: { ...adjustment, note: event.target.value } }))} />
                        <button type="button" className="admin-action-button" disabled={Boolean(actionId)} onClick={() => recordAdjustment(row)}>Record adjustment</button>
                      </div>
                    </details>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </AdminLayout>
  );
}

export default FinanceOperations;
