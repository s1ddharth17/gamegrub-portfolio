import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

import AdminPageHero from "../components/AdminPageHero";
import Pagination from "../components/Pagination";
import usePagination from "../hooks/usePagination";
import AdminLayout from "../layout/AdminLayout";
import BookingCheckInScanner from "../components/BookingCheckInScanner";

import { API_BASE_URL } from "../config/api";
import { useAdminBusiness, withBusinessParams } from "../context/AdminBusinessContext";
import { ADMIN_PERMISSIONS, hasAdminPermission } from "../config/adminSession";

const POLL_INTERVAL_MS = 5000;
const ITEMS_PER_PAGE = 6;
const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "wallet", label: "Wallet" },
];

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function prettifyStatus(status) {
  return String(status || "unknown")
    .replaceAll("_", " ")
    .toUpperCase();
}

function getSessionStatusMeta(status) {
  switch (status) {
    case "running":
      return {
        label: "Running",
        background: "var(--tone-success-bg)",
        border: "var(--tone-success-border)",
        color: "var(--tone-success-text)",
      };
    case "session_over":
      return {
        label: "Ready to settle",
        background: "var(--tone-warning-bg)",
        border: "var(--tone-warning-border)",
        color: "var(--tone-warning-text)",
      };
    default:
      return {
        label: prettifyStatus(status),
        background: "var(--surface-elevated)",
        border: "var(--border)",
        color: "var(--text)",
      };
  }
}

function normalizePaymentMethod(value) {
  return PAYMENT_METHODS.some((method) => method.value === value) ? value : "cash";
}

function POSDesk() {
  const {
    selectedBusiness,
    selectedBusinessId,
    loading: businessLoading,
  } = useAdminBusiness();
  const [sessions, setSessions] = useState([]);
  const [selectedBill, setSelectedBill] = useState(null);
  const [orderSummary, setOrderSummary] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [useLoyalty, setUseLoyalty] = useState(true);
  const [overrideAmount, setOverrideAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);
  const [extendingId, setExtendingId] = useState(null);
  const [error, setError] = useState("");
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInCode, setCheckInCode] = useState("");
  const [checkInPreview, setCheckInPreview] = useState(null);
  const [checkInError, setCheckInError] = useState("");
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [checkInNotice, setCheckInNotice] = useState("");
  const canManageSessions = hasAdminPermission(ADMIN_PERMISSIONS.SESSIONS_MANAGE);

  const loadSessions = useCallback(
    async ({ silent = false } = {}) => {
      if (!selectedBusinessId) {
        setSessions([]);
        setSelectedBill(null);
        setOrderSummary(null);
        setError(
          businessLoading ? "" : "Select a cafe workspace to load its POS queue."
        );
        if (!silent) {
          setLoading(false);
        }
        return;
      }

      if (!silent) {
        setLoading(true);
      }

      try {
        const response = await axios.get(`${API_BASE_URL}/admin/pos-sessions`, {
          params: withBusinessParams(selectedBusinessId),
        });
        setSessions(response.data);
        setError("");
      } catch (requestError) {
        setError(
          requestError.response?.data?.error || "Unable to load POS sessions."
        );
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [businessLoading, selectedBusinessId]
  );

  useEffect(() => {
    loadSessions();

    if (!selectedBusinessId) {
      return undefined;
    }

    const interval = setInterval(
      () => loadSessions({ silent: true }),
      POLL_INTERVAL_MS
    );
    return () => clearInterval(interval);
  }, [loadSessions, selectedBusinessId]);

  const openValue = useMemo(
    () => sessions.reduce((sum, session) => sum + Number(session.total_bill || 0), 0),
    [sessions]
  );

  const sellerNetOpenValue = useMemo(
    () =>
      sessions.reduce(
        (sum, session) => sum + Number(session.seller_net_amount || 0),
        0
      ),
    [sessions]
  );

  const platformOpenValue = useMemo(
    () =>
      sessions.reduce(
        (sum, session) =>
          sum +
          Number(session.platform_commission || 0) +
          Number(session.convenience_fee || 0),
        0
      ),
    [sessions]
  );

  const sessionCounts = useMemo(
    () => ({
      total: sessions.length,
      running: sessions.filter((session) => session.status === "running").length,
      settlement: sessions.filter((session) => session.status === "session_over").length,
    }),
    [sessions]
  );

  const {
    currentPage,
    endItem,
    pageItems,
    setCurrentPage,
    startItem,
    totalItems,
    totalPages,
  } = usePagination(sessions, ITEMS_PER_PAGE, [
    sessions.length,
    selectedBusinessId,
  ]);

  const loadOrderSummary = async (bookingId) => {
    const response = await axios.get(
      `${API_BASE_URL}/order/admin/summary/${bookingId}`
    );
    setOrderSummary(response.data);
  };

  const openSettlement = async (session) => {
    setSelectedBill(session);
    setPaymentMethod(normalizePaymentMethod(session.payment_method));
    setPaymentReference(session.payment_reference || "");
    setUseLoyalty(true);
    setOverrideAmount("");
    await loadOrderSummary(session.booking_id);
  };

  const closeSettlement = () => {
    setSelectedBill(null);
    setOrderSummary(null);
    setPaymentReference("");
    setOverrideAmount("");
  };

  const extendSession = async (bookingId) => {
    setExtendingId(bookingId);

    try {
      await axios.post(`${API_BASE_URL}/booking/admin/extend`, {
        booking_id: bookingId,
      });
      await loadSessions({ silent: true });
    } catch (requestError) {
      window.alert(
        requestError.response?.data?.error || "Failed to extend session."
      );
    } finally {
      setExtendingId(null);
    }
  };

  const emergencyEnd = async (bookingId) => {
    if (!window.confirm("End this session and move it into settlement?")) {
      return;
    }

    try {
      await axios.post(`${API_BASE_URL}/admin/session/end`, {
        booking_id: bookingId,
      });
      await loadSessions({ silent: true });
    } catch (requestError) {
      window.alert(
        requestError.response?.data?.error ||
          "Could not end this session right now."
      );
    }
  };

  const previewCheckIn = async (rawCode) => {
    const code = String(rawCode || "").trim();
    if (!selectedBusinessId || !code) {
      setCheckInError("Select a cafe and scan its customer booking QR.");
      return;
    }
    setCheckInCode(code);
    setCheckInBusy(true);
    setCheckInError("");
    setCheckInPreview(null);
    try {
      const response = await axios.post(`${API_BASE_URL}/admin/session/check-in/preview`, {
        business_id: selectedBusinessId,
        qr_code: code,
      });
      setCheckInPreview(response.data);
    } catch (requestError) {
      setCheckInError(
        requestError.response?.data?.error || "Could not verify that booking QR."
      );
    } finally {
      setCheckInBusy(false);
    }
  };

  const confirmCheckIn = async () => {
    if (!checkInPreview || !checkInCode) return;
    setCheckInBusy(true);
    setCheckInError("");
    try {
      const response = await axios.post(`${API_BASE_URL}/admin/session/check-in`, {
        business_id: selectedBusinessId,
        qr_code: checkInCode,
      });
      setCheckInNotice(
        `${response.data.customer_name} checked in to PC ${response.data.pc_id}.`
      );
      setCheckInOpen(false);
      setCheckInPreview(null);
      setCheckInCode("");
      await loadSessions({ silent: true });
    } catch (requestError) {
      setCheckInError(
        requestError.response?.data?.error || "Could not complete check-in. Scan the QR again."
      );
      setCheckInPreview(null);
    } finally {
      setCheckInBusy(false);
    }
  };

  const closeCheckIn = () => {
    setCheckInOpen(false);
    setCheckInPreview(null);
    setCheckInCode("");
    setCheckInError("");
  };

  const settleBill = async () => {
    if (!selectedBill) {
      return;
    }

    setSettling(true);

    try {
      await axios.post(`${API_BASE_URL}/booking/admin/settle`, {
        booking_id: selectedBill.booking_id,
        override_amount: overrideAmount || null,
        use_loyalty: useLoyalty,
        payment_method: paymentMethod,
        payment_reference: paymentReference || null,
      });

      closeSettlement();
      await loadSessions({ silent: true });
    } catch (requestError) {
      window.alert(
        requestError.response?.data?.error ||
          "Could not settle this bill. Please try again."
      );
    } finally {
      setSettling(false);
    }
  };

  return (
    <AdminLayout>
      <AdminPageHero
        eyebrow="POS Desk"
        title="POS"
        subtitle={
          selectedBusiness
            ? `Run live sessions, extensions, and final settlements for ${selectedBusiness.name} from one business-scoped cash desk.`
            : "Run live sessions, extensions, and final settlements from one business-scoped cash desk."
        }
        chips={[
          `${sessionCounts.running} running`,
          `${sessionCounts.settlement} ready to settle`,
          selectedBusiness?.name || `${sessionCounts.total} sessions tracked`,
        ]}
        badge={{
          title: "Customer due",
          value: formatCurrency(openValue),
          meta: `${formatCurrency(
            sellerNetOpenValue
          )} seller net | ${formatCurrency(platformOpenValue)} platform take`,
          label: "Cash desk",
        }}
        actions={
          <div className="booking-checkin-scanner__hero-actions">
            {canManageSessions ? (
              <button
                type="button"
                className="admin-action-button"
                onClick={() => {
                  setCheckInNotice("");
                  setCheckInError("");
                  setCheckInOpen(true);
                }}
                disabled={!selectedBusinessId}
              >
                Scan check-in QR
              </button>
            ) : null}
            <button
              type="button"
              className="admin-action-button rig-fleet__refresh-button"
              onClick={() => loadSessions()}
              disabled={loading || !selectedBusinessId}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        }
      />

      <div className="admin-ops-summary">
        <OpsSummaryStat
          label="Sessions"
          value={sessionCounts.total}
          meta="Visible at POS"
          tone="warm"
        />
        <OpsSummaryStat
          label="Running"
          value={sessionCounts.running}
          meta="Currently gaming"
          tone="success"
        />
        <OpsSummaryStat
          label="Ready to settle"
          value={sessionCounts.settlement}
          meta="Ended sessions"
          tone="warning"
        />
        <OpsSummaryStat
          label="Customer due"
          value={formatCurrency(openValue)}
          meta="Projected collection"
          tone="neutral"
        />
        <OpsSummaryStat
          label="Seller net"
          value={formatCurrency(sellerNetOpenValue)}
          meta="Expected payout value"
          tone="success"
        />
        <OpsSummaryStat
          label="Platform take"
          value={formatCurrency(platformOpenValue)}
          meta="Convenience + commission"
          tone="warning"
        />
      </div>

      {error ? <div style={errorBanner}>{error}</div> : null}
      {checkInNotice ? <div className="booking-checkin-scanner__success" role="status">{checkInNotice}</div> : null}

      {loading ? (
        <div className="admin-empty-state">Loading sessions...</div>
      ) : sessions.length === 0 ? (
        <div className="admin-empty-state">No sessions awaiting action.</div>
      ) : (
        <>
          <div className="admin-panel-soft admin-ops-list-shell">
            <div className="admin-ops-list-shell__header">
              <div>
                <div className="admin-ops-list-shell__eyebrow">Live queue</div>
                <div className="admin-ops-list-shell__title">Sessions in view</div>
              </div>
              <div className="admin-ops-list-shell__meta">
                Showing {startItem}-{endItem} of {totalItems}
              </div>
            </div>

            <div className="admin-ops-list">
              {pageItems.map((session) => {
                const statusMeta = getSessionStatusMeta(session.status);
                const isSessionOver = session.status === "session_over";

                return (
                  <article
                    key={session.booking_id}
                    className={`admin-ops-row admin-surface-hover${
                      isSessionOver ? " admin-ops-row--attention" : ""
                    }`}
                  >
                    <div className="admin-ops-row__primary">
                      <div className="admin-ops-row__eyebrow">
                        PC {session.pc_id} | Booking #{session.booking_id}
                      </div>
                      <div className="admin-ops-row__title">
                        {session.user_name || "Unknown player"}
                      </div>
                      <div className="admin-ops-row__meta">
                        {session.pc_specs || "Machine details not available"}
                      </div>
                      <div className="admin-ops-chip-group">
                        <span className="admin-ops-chip">
                          Payment {prettifyStatus(session.payment_method)}
                        </span>
                        <span className="admin-ops-chip admin-ops-chip--info">
                          Loyalty {session.loyalty_points || 0} pts
                        </span>
                      </div>
                    </div>

                    <div className="admin-ops-row__block">
                      <div className="admin-ops-row__label">Session metrics</div>
                      <div className="admin-ops-row__metrics">
                        <Metric
                          label="Live time"
                          value={`${session.running_minutes || 0} min`}
                        />
                        <Metric
                          label="Gaming"
                          value={formatCurrency(session.gaming_cost)}
                        />
                        <Metric
                          label="Food"
                          value={formatCurrency(session.food_total)}
                        />
                        <Metric
                          label="Convenience"
                          value={formatCurrency(session.convenience_fee)}
                        />
                        <Metric
                          label="Redeemable"
                          value={formatCurrency(session.loyalty_redeemable)}
                        />
                      </div>
                    </div>

                    <div className="admin-ops-row__block">
                      <div className="admin-ops-row__label">Bill snapshot</div>
                      <div className="admin-ops-row__value">
                        {formatCurrency(session.total_bill)}
                      </div>
                      <div className="admin-ops-row__hint">
                        {session.open_item_lines || 0} line items | Seller net{" "}
                        {formatCurrency(session.seller_net_amount)}
                      </div>
                      <div className="admin-ops-row__hint">
                        Status {prettifyStatus(session.status)} | Platform take{" "}
                        {formatCurrency(
                          Number(session.platform_commission || 0) +
                            Number(session.convenience_fee || 0)
                        )}
                      </div>
                    </div>

                    <div className="admin-ops-actions">
                      <span
                        className="admin-ops-status"
                        style={{
                          background: statusMeta.background,
                          borderColor: statusMeta.border,
                          color: statusMeta.color,
                        }}
                      >
                        {statusMeta.label}
                      </span>
                      {session.status === "running" ? (
                        <>
                          <button
                            type="button"
                            className="admin-action-button"
                            style={ghostButton}
                            disabled={extendingId === session.booking_id}
                            onClick={() => extendSession(session.booking_id)}
                          >
                            {extendingId === session.booking_id
                              ? "Extending..."
                              : "Extend 1h"}
                          </button>
                          <button
                            type="button"
                            className="admin-action-button"
                            style={dangerButton}
                            onClick={() => emergencyEnd(session.booking_id)}
                          >
                            End session
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="admin-action-button"
                          style={primaryButton}
                          onClick={() => openSettlement(session)}
                        >
                          Settle bill
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            startItem={startItem}
            endItem={endItem}
            label="sessions"
            onPageChange={setCurrentPage}
          />
        </>
      )}

      {selectedBill ? (
        <div className="admin-modal-overlay">
          <div className="admin-modal-card">
            <div style={modalHeader}>
              <div>
                <div style={modalTitle}>
                  Settle booking #{selectedBill.booking_id}
                </div>
                <div style={modalMeta}>
                  {selectedBill.user_name} | PC {selectedBill.pc_id}
                </div>
              </div>

              <button
                type="button"
                className="admin-action-button"
                style={closeButton}
                onClick={closeSettlement}
              >
                Close
              </button>
            </div>

            <div style={modalGrid}>
              <div style={modalPanel}>
                <div style={panelTitle}>Charges</div>
                <SummaryRow
                  label="Gaming"
                  value={formatCurrency(selectedBill.gaming_cost)}
                />
                <SummaryRow
                  label="Food"
                  value={formatCurrency(selectedBill.food_total)}
                />
                <SummaryRow
                  label="Subtotal"
                  value={formatCurrency(selectedBill.subtotal)}
                />
                <SummaryRow
                  label="Convenience fee"
                  value={formatCurrency(selectedBill.convenience_fee)}
                />
                <SummaryRow
                  label="Loyalty available"
                  value={formatCurrency(selectedBill.loyalty_redeemable)}
                />
                <SummaryRow
                  label="Platform commission"
                  value={formatCurrency(selectedBill.platform_commission)}
                />
                <SummaryRow
                  label="Seller net"
                  value={formatCurrency(selectedBill.seller_net_amount)}
                />
                <SummaryRow
                  label="Projected total"
                  value={formatCurrency(selectedBill.total_bill)}
                  strong
                />
              </div>

              <div style={modalPanel}>
                <div style={panelTitle}>Payment</div>
                <label style={fieldLabel}>
                  Payment method
                  <select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={fieldLabel}>
                  Reference
                  <input
                    value={paymentReference}
                    onChange={(event) => setPaymentReference(event.target.value)}
                    placeholder="Optional"
                  />
                </label>

                <label style={fieldLabel}>
                  Override final amount
                  <input
                    value={overrideAmount}
                    onChange={(event) => setOverrideAmount(event.target.value)}
                    placeholder="Leave blank to use the live total"
                  />
                </label>

                <label className="admin-toggle-row">
                  <input
                    type="checkbox"
                    checked={useLoyalty}
                    onChange={(event) => setUseLoyalty(event.target.checked)}
                  />
                  Apply loyalty points
                </label>

                <div style={paymentHint}>
                  Customer due {formatCurrency(selectedBill.amount_due)} | Captured{" "}
                  {formatCurrency(selectedBill.captured_amount)}
                </div>
              </div>
            </div>

            <div style={modalPanel}>
              <div style={panelTitle}>Food orders</div>
              {orderSummary?.orders?.length ? (
                <div className="admin-ops-orders">
                  {orderSummary.orders.map((order) => (
                    <div key={order.order_id} className="admin-ops-order">
                      <div className="admin-ops-order__top">
                        <div>
                          <div style={orderTitle}>Order #{order.order_id}</div>
                          <div className="admin-ops-order__meta">
                            {prettifyStatus(order.status)}
                          </div>
                        </div>
                        <div style={orderTotal}>
                          {formatCurrency(order.total_amount)}
                        </div>
                      </div>

                      <div className="admin-ops-order__items">
                        {order.items.map((item) => (
                          <div
                            key={item.item_id}
                            className="admin-ops-order__item"
                          >
                            <span>
                              {item.name} x {item.qty}
                            </span>
                            <span>{formatCurrency(item.total)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyMiniState}>No open orders.</div>
              )}
            </div>

            <div style={footerRow}>
              <button
                type="button"
                className="admin-action-button"
                style={ghostButton}
                onClick={closeSettlement}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-action-button"
                style={primaryButton}
                disabled={settling}
                onClick={settleBill}
              >
                {settling ? "Saving..." : "Confirm settlement"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {checkInOpen ? (
        <div className="admin-modal-overlay" role="presentation">
          <div className="admin-modal-card booking-checkin-modal" role="dialog" aria-modal="true" aria-labelledby="checkin-title">
            <div className="booking-checkin-modal__header">
              <div>
                <h2 id="checkin-title">Booking check-in</h2>
                <p>Scan the customer QR, confirm the booking and station, then check them in.</p>
              </div>
              <button type="button" className="admin-action-button" onClick={closeCheckIn} disabled={checkInBusy}>Close</button>
            </div>

            {checkInPreview ? (
              <div className="booking-checkin-preview">
                <div className="booking-checkin-preview__eyebrow">Confirm customer and station</div>
                <h3>{checkInPreview.customer_name}</h3>
                <div className="booking-checkin-preview__details">
                  <div><span>Booking</span><strong>#{checkInPreview.booking_id}</strong></div>
                  <div><span>Station</span><strong>PC {checkInPreview.pc_id}</strong></div>
                  <div><span>Visit</span><strong>{checkInPreview.business_name}</strong></div>
                  <div><span>Start</span><strong>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: checkInPreview.timezone }).format(new Date(checkInPreview.scheduled_start))}</strong></div>
                </div>
                {checkInPreview.pc_specs ? <p className="booking-checkin-preview__specs">{checkInPreview.pc_specs}</p> : null}
                <div className="booking-checkin-modal__footer">
                  <button type="button" className="admin-action-button" onClick={() => setCheckInPreview(null)} disabled={checkInBusy}>Scan a different code</button>
                  <button type="button" className="admin-action-button" onClick={confirmCheckIn} disabled={checkInBusy}>
                    {checkInBusy ? "Checking in..." : `Confirm check-in for PC ${checkInPreview.pc_id}`}
                  </button>
                </div>
              </div>
            ) : (
              <BookingCheckInScanner
                onScan={previewCheckIn}
                error={checkInError}
                busy={checkInBusy}
              />
            )}
            {checkInPreview && checkInError ? <div className="booking-checkin-scanner__error" role="alert">{checkInError}</div> : null}
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <div className="admin-ops-row__metric-label">{label}</div>
      <div className="admin-ops-row__metric-value">{value}</div>
    </div>
  );
}

function SummaryRow({ label, value, strong = false }) {
  return (
    <div style={summaryRow}>
      <div style={summaryRowLabel}>{label}</div>
      <div style={strong ? summaryRowStrongValue : summaryRowValue}>{value}</div>
    </div>
  );
}

function OpsSummaryStat({ label, value, meta, tone }) {
  return (
    <div className={`admin-ops-summary__item admin-ops-summary__item--${tone}`}>
      <div className="admin-ops-summary__label">{label}</div>
      <div className="admin-ops-summary__value">{value}</div>
      <div className="admin-ops-summary__meta">{meta}</div>
    </div>
  );
}

export default POSDesk;

const errorBanner = {
  marginBottom: 18,
  padding: 16,
  borderRadius: 18,
  background: "var(--tone-danger-bg)",
  border: "1px solid var(--tone-danger-border)",
  color: "var(--tone-danger-text)",
};

const primaryButton = {
  borderRadius: 16,
  border: "1px solid color-mix(in srgb, var(--secondary) 28%, var(--border))",
  background: "linear-gradient(135deg, var(--primary), var(--secondary))",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
  padding: "12px 16px",
};

const ghostButton = {
  borderRadius: 16,
  border: "1px solid var(--border)",
  background: "var(--surface-elevated)",
  color: "var(--text)",
  fontWeight: 700,
  cursor: "pointer",
  padding: "12px 16px",
};

const dangerButton = {
  ...ghostButton,
  background: "var(--tone-danger-bg)",
  borderColor: "var(--tone-danger-border)",
  color: "var(--tone-danger-text)",
};

const modalHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 20,
};

const modalTitle = {
  color: "var(--text)",
  fontSize: 26,
  fontWeight: 800,
};

const modalMeta = {
  marginTop: 6,
  color: "var(--text-secondary)",
  fontSize: 14,
};

const closeButton = {
  padding: "12px 14px",
  borderRadius: 16,
  border: "1px solid var(--border)",
  background: "var(--surface-elevated)",
  color: "var(--text)",
  cursor: "pointer",
};

const modalGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
  marginBottom: 16,
};

const modalPanel = {
  padding: 18,
  borderRadius: 22,
  background: "var(--surface-elevated)",
  border: "1px solid var(--border)",
  marginBottom: 16,
};

const panelTitle = {
  color: "var(--text)",
  fontSize: 14,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 14,
};

const summaryRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 0",
  borderBottom: "1px solid var(--border)",
};

const summaryRowLabel = {
  color: "var(--text-secondary)",
  fontSize: 13,
};

const summaryRowValue = {
  color: "var(--text)",
  fontWeight: 600,
};

const summaryRowStrongValue = {
  color: "var(--text)",
  fontWeight: 800,
  fontSize: 18,
};

const fieldLabel = {
  display: "block",
  color: "var(--text-secondary)",
  fontSize: 13,
  marginBottom: 12,
};

const paymentHint = {
  color: "var(--text-secondary)",
  fontSize: 13,
  marginTop: 12,
  lineHeight: 1.6,
};

const orderTitle = {
  color: "var(--text)",
  fontWeight: 700,
};

const orderTotal = {
  color: "var(--text)",
  fontWeight: 700,
};

const emptyMiniState = {
  color: "var(--text-secondary)",
  fontSize: 14,
};

const footerRow = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
};
