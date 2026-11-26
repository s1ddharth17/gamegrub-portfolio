import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

import AdminMetricCard from "../components/AdminMetricCard";
import AdminPageHero from "../components/AdminPageHero";
import Pagination from "../components/Pagination";
import usePagination from "../hooks/usePagination";
import AdminLayout from "../layout/AdminLayout";

import { API_BASE_URL } from "../config/api";
import { getAdminProfile } from "../config/adminSession";
import { useAdminBusiness, withBusinessParams } from "../context/AdminBusinessContext";

const ITEMS_PER_PAGE = 8;

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDateTime(value) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDateInputValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function prettifyStatus(status) {
  return String(status || "unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function BillingArchive() {
  const { selectedBusiness, selectedBusinessId, loading: businessLoading } = useAdminBusiness();
  const [bills, setBills] = useState([]);
  const [settlementSummary, setSettlementSummary] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [selectedBill, setSelectedBill] = useState(null);
  const [search, setSearch] = useState("");
  const [payoutCutoffDate, setPayoutCutoffDate] = useState(() => formatDateInputValue());
  const [payoutNotes, setPayoutNotes] = useState("");
  const [financeActionLoading, setFinanceActionLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const admin = getAdminProfile();
  const isSuperAdmin = admin?.role === "super_admin";

  const loadBills = useCallback(async () => {
    if (!selectedBusinessId) {
      setBills([]);
      setSettlementSummary(null);
      setPayouts([]);
      setSelectedBill(null);
      setLoading(false);
      setError(businessLoading ? "" : "Select a cafe workspace to load billing history.");
      return;
    }

    try {
      setLoading(true);
      const params = withBusinessParams(selectedBusinessId);
      const [billsResponse, settlementResponse, payoutsResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/bills/all`, { params }),
        axios.get(`${API_BASE_URL}/admin/settlements/summary`, { params }),
        axios.get(`${API_BASE_URL}/admin/settlements/payouts`, { params }),
      ]);
      setBills(billsResponse.data);
      setSettlementSummary(settlementResponse.data);
      setPayouts(payoutsResponse.data);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to load billing history.");
    } finally {
      setLoading(false);
    }
  }, [businessLoading, selectedBusinessId]);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  const visibleBills = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return bills;
    }

    return bills.filter((bill) =>
      [bill.user_name, bill.payment_method, bill.payment_reference, bill.specs, bill.booking_id, bill.bill_id]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [bills, search]);

  const {
    currentPage,
    endItem,
    pageItems,
    setCurrentPage,
    startItem,
    totalItems,
    totalPages,
  } = usePagination(visibleBills, ITEMS_PER_PAGE, [bills.length, search]);

  const totals = useMemo(
    () => ({
      revenue: bills.reduce((sum, bill) => sum + Number(bill.customer_final_amount || 0), 0),
      settled: bills.length,
      loyalty: bills.reduce((sum, bill) => sum + Number(bill.loyalty_used || 0), 0),
      food: bills.reduce((sum, bill) => sum + Number(bill.food_cost || 0), 0),
      platformTake: bills.reduce(
        (sum, bill) =>
          sum +
          Number(bill.platform_commission || 0) +
          Number(bill.convenience_fee || 0),
        0
      ),
      sellerNet: bills.reduce((sum, bill) => sum + Number(bill.seller_net_amount || 0), 0),
    }),
    [bills]
  );
  const visibleLabel =
    visibleBills.length === 1 ? "1 bill visible" : `${visibleBills.length} bills visible`;

  const openInvoice = async (billId) => {
    if (!selectedBusinessId) {
      window.alert("Choose a cafe workspace before opening an invoice.");
      return;
    }

    const response = await axios.get(`${API_BASE_URL}/bills/admin/${billId}`, {
      params: withBusinessParams(selectedBusinessId),
    });
    setSelectedBill(response.data);
  };

  const requestPayoutBatch = async () => {
    if (!selectedBusinessId) {
      window.alert("Choose a cafe workspace before requesting a payout batch.");
      return;
    }

    try {
      setFinanceActionLoading(true);
      await axios.post(`${API_BASE_URL}/admin/settlements/payouts/request`, {
        business_id: selectedBusinessId,
        cutoff_date: payoutCutoffDate,
        notes: payoutNotes,
      });
      setPayoutNotes("");
      await loadBills();
    } catch (requestError) {
      window.alert(requestError.response?.data?.error || "Unable to create a payout batch.");
    } finally {
      setFinanceActionLoading(false);
    }
  };

  const updatePayoutStatus = async (payoutId, nextStatus) => {
    if (!selectedBusinessId) {
      return;
    }

    const payoutReference =
      nextStatus === "paid"
        ? window.prompt("Enter the payout reference or UTR for this release.", "") || ""
        : "";

    try {
      setFinanceActionLoading(true);
      await axios.put(`${API_BASE_URL}/admin/settlements/payouts/${payoutId}/status`, {
        status: nextStatus,
        payout_reference: payoutReference,
      });
      await loadBills();
    } catch (requestError) {
      window.alert(requestError.response?.data?.error || "Unable to update payout status.");
    } finally {
      setFinanceActionLoading(false);
    }
  };

  const printInvoice = () => window.print();

  return (
    <>
      <style>{printStyles}</style>
      <AdminLayout>
        <AdminPageHero
          eyebrow="Billing Archive"
          title="Billing"
          subtitle={
            selectedBusiness
              ? `Browse settled bills, payout batches, and commission splits for ${selectedBusiness.name} from one seller-facing finance desk.`
              : "Browse settled bills, payout batches, and commission splits from one seller-facing finance desk."
          }
          chips={[
            `${formatCurrency(totals.revenue)} revenue`,
            `${formatCurrency(settlementSummary?.platform_take_amount)} platform take`,
            `${formatCurrency(settlementSummary?.unsettled_seller_net_amount)} pending seller net`,
            selectedBusiness?.name || visibleLabel,
          ]}
          badge={{
            title: "Pending payout",
            value: formatCurrency(settlementSummary?.unsettled_seller_net_amount),
            meta: `${settlementSummary?.unsettled_bill_count ?? 0} bills still unbatched`,
            label: "Settlement desk",
          }}
          actions={
            <>
              <input
                className="admin-search"
                style={searchInput}
                placeholder="Search by user, payment mode, bill, booking, or PC"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <button
                type="button"
                className="admin-action-button rig-fleet__refresh-button"
                onClick={loadBills}
                disabled={loading || !selectedBusinessId}
              >
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </>
          }
        />

        <div className="admin-metric-grid">
          <AdminMetricCard icon="BIL" label="Bills" value={totals.settled} hint={visibleLabel} tone="warm" />
          <AdminMetricCard
            icon="CUS"
            label="Customer paid"
            value={formatCurrency(totals.revenue)}
            hint="Including convenience fees"
            tone="cool"
          />
          <AdminMetricCard
            icon="FOD"
            label="Food"
            value={formatCurrency(totals.food)}
            hint="Food charges only"
            tone="gold"
          />
          <AdminMetricCard
            icon="LOY"
            label="Loyalty redeemed"
            value={formatCurrency(totals.loyalty)}
            hint="Applied discounts"
            tone="neutral"
          />
          <AdminMetricCard
            icon="COM"
            label="Platform take"
            value={formatCurrency(totals.platformTake)}
            hint="Commission + convenience"
            tone="warning"
          />
          <AdminMetricCard
            icon="SEL"
            label="Seller net"
            value={formatCurrency(totals.sellerNet)}
            hint="Net payable to the cafe"
            tone="success"
          />
        </div>

        {error ? <div style={errorBanner}>{error}</div> : null}

        {settlementSummary ? (
          <>
            <section className="dashboard-panel dashboard-panel--full admin-surface-hover" style={financePanel}>
              <div className="dashboard-panel__header">
                <div>
                  <div className="dashboard-panel__eyebrow">Settlement ledger</div>
                  <div className="dashboard-panel__title">Seller payout runway</div>
                  <div className="dashboard-panel__subtitle">
                    Unbatched seller net, platform earnings, and payout lifecycle across this cafe.
                  </div>
                </div>
              </div>

              <div style={settlementGrid}>
                <FinanceStat
                  label="Seller net pending"
                  value={formatCurrency(settlementSummary.unsettled_seller_net_amount)}
                  hint={`${settlementSummary.unsettled_bill_count ?? 0} eligible bills`}
                />
                <FinanceStat
                  label="Platform commission"
                  value={formatCurrency(settlementSummary.platform_commission_amount)}
                  hint="From service totals"
                />
                <FinanceStat
                  label="Convenience earned"
                  value={formatCurrency(settlementSummary.convenience_fee_amount)}
                  hint="Charged to buyers"
                />
                <FinanceStat
                  label="Paid out"
                  value={formatCurrency(settlementSummary.paid_payout_amount)}
                  hint={`${settlementSummary.paid_payout_count ?? 0} completed batches`}
                />
              </div>

              <div style={settlementActionRow}>
                <div style={requestCard}>
                  <div style={requestTitle}>Create payout batch</div>
                  <div style={requestMeta}>
                    Reserve the currently unsettled seller share into a batch the platform can process and mark paid later.
                  </div>
                  <div style={requestFormRow}>
                    <label style={fieldLabel}>
                      Cutoff date
                      <input
                        type="date"
                        className="admin-search"
                        style={dateInput}
                        value={payoutCutoffDate}
                        onChange={(event) => setPayoutCutoffDate(event.target.value)}
                      />
                    </label>
                    <label style={fieldLabel}>
                      Notes
                      <input
                        className="admin-search"
                        style={notesInput}
                        placeholder="Optional payout memo"
                        value={payoutNotes}
                        onChange={(event) => setPayoutNotes(event.target.value)}
                      />
                    </label>
                    <button
                      type="button"
                      className="admin-action-button"
                      style={requestButton}
                      onClick={requestPayoutBatch}
                      disabled={
                        financeActionLoading ||
                        !selectedBusinessId ||
                        Number(settlementSummary.unsettled_bill_count || 0) <= 0
                      }
                    >
                      {financeActionLoading ? "Working..." : "Request payout batch"}
                    </button>
                  </div>
                </div>

                <div style={payoutMetaCard}>
                  <div style={requestTitle}>Batch health</div>
                  <div style={metaStack}>
                    <FinanceMetaRow
                      label="Pending"
                      value={`${settlementSummary.pending_payout_count ?? 0} | ${formatCurrency(
                        settlementSummary.pending_payout_amount
                      )}`}
                    />
                    <FinanceMetaRow
                      label="Processing"
                      value={`${settlementSummary.processing_payout_count ?? 0} | ${formatCurrency(
                        settlementSummary.processing_payout_amount
                      )}`}
                    />
                    <FinanceMetaRow
                      label="On hold"
                      value={`${settlementSummary.on_hold_payout_count ?? 0} | ${formatCurrency(
                        settlementSummary.on_hold_payout_amount
                      )}`}
                    />
                    <FinanceMetaRow
                      label="Latest paid"
                      value={formatDateTime(settlementSummary.latest_paid_at)}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="dashboard-panel dashboard-panel--full admin-surface-hover" style={financePanel}>
              <div className="dashboard-panel__header">
                <div>
                  <div className="dashboard-panel__eyebrow">Payout batches</div>
                  <div className="dashboard-panel__title">Settlement history</div>
                  <div className="dashboard-panel__subtitle">
                    Track every batched release from seller net pending through final payout confirmation.
                  </div>
                </div>
              </div>

              {payouts.length ? (
                <div style={payoutGrid}>
                  {payouts.map((payout) => (
                    <div key={payout.payout_id} style={payoutCard}>
                      <div style={cardTop}>
                        <div>
                          <div style={billId}>Batch #{payout.payout_id}</div>
                          <div style={metaText}>
                            {payout.period_start || "?"} to {payout.period_end || "?"}
                          </div>
                        </div>
                        <div style={statusBadge(payout.status)}>{prettifyStatus(payout.status)}</div>
                      </div>

                      <div style={summaryList}>
                        <div style={summaryRow}>
                          <span>Seller net</span>
                          <span>{formatCurrency(payout.seller_net_amount)}</span>
                        </div>
                        <div style={summaryRow}>
                          <span>Platform take</span>
                          <span>{formatCurrency(payout.platform_take_amount)}</span>
                        </div>
                        <div style={summaryRow}>
                          <span>Customer total</span>
                          <span>{formatCurrency(payout.customer_total_amount)}</span>
                        </div>
                        <div style={summaryRow}>
                          <span>Bills batched</span>
                          <span>{payout.bill_count}</span>
                        </div>
                        <div style={summaryRow}>
                          <span>Requested</span>
                          <span>{formatDateTime(payout.requested_at)}</span>
                        </div>
                        <div style={summaryRow}>
                          <span>Paid</span>
                          <span>{formatDateTime(payout.paid_at)}</span>
                        </div>
                        {payout.payout_reference ? (
                          <div style={summaryRow}>
                            <span>Reference</span>
                            <span>{payout.payout_reference}</span>
                          </div>
                        ) : null}
                      </div>

                      {isSuperAdmin ? (
                        <div style={payoutButtonRow}>
                          <button
                            type="button"
                            className="admin-action-button"
                            style={secondaryButton}
                            onClick={() => updatePayoutStatus(payout.payout_id, "processing")}
                            disabled={financeActionLoading || payout.status === "processing"}
                          >
                            Mark processing
                          </button>
                          <button
                            type="button"
                            className="admin-action-button"
                            style={secondaryButton}
                            onClick={() => updatePayoutStatus(payout.payout_id, "on_hold")}
                            disabled={financeActionLoading || payout.status === "on_hold"}
                          >
                            Put on hold
                          </button>
                          <button
                            type="button"
                            className="admin-action-button"
                            style={viewButton}
                            onClick={() => updatePayoutStatus(payout.payout_id, "paid")}
                            disabled={financeActionLoading || payout.status === "paid"}
                          >
                            Mark paid
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="admin-empty-state">No payout batches created yet.</div>
              )}
            </section>
          </>
        ) : null}

      {loading ? (
        <div className="admin-empty-state">Loading bills...</div>
      ) : visibleBills.length === 0 ? (
        <div className="admin-empty-state">No bills found.</div>
      ) : (
          <>
            <div style={grid}>
              {pageItems.map((bill) => (
                <div key={bill.bill_id} className="admin-surface-hover" style={card}>
                  <div style={cardTop}>
                    <div>
                      <div style={billId}>Bill #{bill.bill_id}</div>
                      <div style={metaText}>Booking #{bill.booking_id}</div>
                    </div>
                    <div style={amountBadge}>{formatCurrency(bill.final_amount)}</div>
                  </div>

                  <div style={infoBlock}>
                    <div style={infoTitle}>{bill.user_name}</div>
                    <div style={infoMeta}>{bill.specs}</div>
                    <div style={infoMeta}>{formatDateTime(bill.created_at)}</div>
                  </div>

                  <div style={summaryList}>
                    <div style={summaryRow}>
                      <span>Gaming</span>
                      <span>{formatCurrency(bill.gaming_cost)}</span>
                    </div>
                    <div style={summaryRow}>
                      <span>Food</span>
                      <span>{formatCurrency(bill.food_cost)}</span>
                    </div>
                    <div style={summaryRow}>
                      <span>Loyalty used</span>
                      <span>{formatCurrency(bill.loyalty_used)}</span>
                    </div>
                    <div style={summaryRow}>
                      <span>Seller net</span>
                      <span>{formatCurrency(bill.seller_net_amount)}</span>
                    </div>
                    <div style={summaryRow}>
                      <span>Platform take</span>
                      <span>
                        {formatCurrency(
                          Number(bill.platform_commission || 0) + Number(bill.convenience_fee || 0)
                        )}
                      </span>
                    </div>
                    <div style={summaryRow}>
                      <span>Payment</span>
                      <span>{String(bill.payment_method || "unknown").toUpperCase()}</span>
                    </div>
                  </div>

                  <div style={billSettlementMeta}>
                    <span>{bill.payout_id ? `Batch #${bill.payout_id}` : "Not batched yet"}</span>
                    <span>{prettifyStatus(bill.payout_status || "pending")}</span>
                  </div>

                  <button
                    type="button"
                    className="admin-action-button"
                    style={viewButton}
                    onClick={() => openInvoice(bill.bill_id)}
                  >
                    View invoice
                  </button>
                </div>
              ))}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              startItem={startItem}
              endItem={endItem}
              label="bills"
              onPageChange={setCurrentPage}
            />
          </>
        )}

        {selectedBill ? (
          <div className="admin-modal-overlay">
            <div className="admin-modal-card invoice-print" style={invoice}>
              <div style={invoiceHeader}>
                <div>
                  <div style={invoiceEyebrow}>GameGrub</div>
                  <div style={invoiceTitle}>Invoice</div>
                </div>

                <div style={invoiceTopMeta}>
                  <div>Bill #{selectedBill.bill.bill_id}</div>
                  <div>{formatDateTime(selectedBill.bill.created_at)}</div>
                </div>
              </div>

              <div style={metaGrid}>
                <MetaCard label="Customer" value={selectedBill.bill.name} />
                <MetaCard label="Mobile" value={selectedBill.bill.mobile} />
                <MetaCard label="PC" value={selectedBill.bill.specs} />
                <MetaCard
                  label="Payment"
                  value={String(selectedBill.bill.payment_method || "unknown").toUpperCase()}
                />
              </div>

              <div style={divider} />

              <div style={panelTitle}>Items</div>
              {selectedBill.items.length ? (
                <div style={invoiceItems}>
                  {selectedBill.items.map((item, index) => (
                    <div key={`${item.name}-${index}`} style={invoiceItemRow}>
                      <span>
                        {item.name} x {item.qty}
                      </span>
                      <span>{formatCurrency(item.total)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyMiniState}>No food items.</div>
              )}

              <div style={divider} />

              <div style={panelTitle}>Breakdown</div>
              <div style={invoiceSummary}>
                <InvoiceRow label="Gaming charges" value={formatCurrency(selectedBill.bill.gaming_cost)} />
                <InvoiceRow label="Food charges" value={formatCurrency(selectedBill.bill.food_cost)} />
                <InvoiceRow label="Subtotal" value={formatCurrency(selectedBill.bill.subtotal)} />
                <InvoiceRow
                  label="Convenience fee"
                  value={formatCurrency(selectedBill.bill.convenience_fee)}
                />
                <InvoiceRow label="Loyalty used" value={formatCurrency(selectedBill.bill.loyalty_used)} />
                <InvoiceRow
                  label="Customer paid"
                  value={formatCurrency(selectedBill.bill.customer_final_amount)}
                />
                <InvoiceRow
                  label="Platform commission"
                  value={formatCurrency(selectedBill.bill.platform_commission)}
                />
                <InvoiceRow
                  label="Seller net"
                  value={formatCurrency(selectedBill.bill.seller_net_amount)}
                />
                <InvoiceRow
                  label="Payout batch"
                  value={
                    selectedBill.bill.payout_id
                      ? `#${selectedBill.bill.payout_id} | ${prettifyStatus(
                          selectedBill.bill.payout_status
                        )}`
                      : "Not batched yet"
                  }
                />
                <InvoiceRow label="Earned loyalty" value={`${selectedBill.bill.earned_loyalty} pts`} />
                <InvoiceRow
                  label="Payment reference"
                  value={selectedBill.bill.payment_reference || "Not available"}
                />
              </div>

              <div style={invoiceTotalBar}>
                <span>Seller service total</span>
                <span>{formatCurrency(selectedBill.bill.final_amount)}</span>
              </div>

              <div style={buttonRow}>
                <button
                  type="button"
                  className="admin-action-button"
                  style={secondaryButton}
                  onClick={() => setSelectedBill(null)}
                >
                  Close
                </button>
                <button type="button" className="admin-action-button" style={viewButton} onClick={printInvoice}>
                  Print
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </AdminLayout>
    </>
  );
}

function MetaCard({ label, value }) {
  return (
    <div style={metaCard}>
      <div style={metaLabel}>{label}</div>
      <div style={metaValue}>{value || "-"}</div>
    </div>
  );
}

function FinanceStat({ label, value, hint }) {
  return (
    <div style={financeStatCard}>
      <div style={metaLabel}>{label}</div>
      <div style={financeStatValue}>{value}</div>
      <div style={infoMeta}>{hint}</div>
    </div>
  );
}

function FinanceMetaRow({ label, value }) {
  return (
    <div style={summaryRow}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function InvoiceRow({ label, value }) {
  return (
    <div style={summaryRow}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default BillingArchive;

const printStyles = `
@media print {
  body * {
    visibility: hidden;
  }

  .invoice-print, .invoice-print * {
    visibility: visible;
  }

  .invoice-print {
    position: absolute;
    inset: 0;
    width: 100%;
    min-height: 100%;
    background: white !important;
    color: #111827 !important;
    border: none !important;
    box-shadow: none !important;
    padding: 40px !important;
  }

  button {
    display: none !important;
  }
}
`;

const searchInput = {
  flex: "1 1 320px",
};

const errorBanner = {
  marginBottom: 18,
  padding: 16,
  borderRadius: 18,
  background: "var(--tone-danger-bg)",
  border: "1px solid var(--tone-danger-border)",
  color: "var(--tone-danger-text)",
};

const financePanel = {
  marginBottom: 20,
};

const settlementGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
  gap: 14,
  marginBottom: 18,
};

const financeStatCard = {
  padding: 16,
  borderRadius: 18,
  background: "var(--surface-elevated)",
  border: "1px solid var(--border)",
};

const financeStatValue = {
  color: "var(--text)",
  fontSize: 24,
  fontWeight: 800,
  marginBottom: 6,
};

const settlementActionRow = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
  gap: 18,
};

const requestCard = {
  padding: 18,
  borderRadius: 22,
  background: "linear-gradient(180deg, var(--surface), var(--surface-elevated))",
  border: "1px solid var(--border)",
};

const requestTitle = {
  color: "var(--text)",
  fontWeight: 800,
  fontSize: 18,
  marginBottom: 8,
};

const requestMeta = {
  color: "var(--text-secondary)",
  fontSize: 13,
  lineHeight: 1.6,
  marginBottom: 16,
};

const requestFormRow = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
  gap: 12,
  alignItems: "end",
};

const fieldLabel = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  color: "var(--text-secondary)",
  fontSize: 13,
  fontWeight: 600,
};

const dateInput = {
  width: "100%",
};

const notesInput = {
  width: "100%",
};

const requestButton = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 18,
  border: "1px solid color-mix(in srgb, var(--secondary) 28%, var(--border))",
  background: "linear-gradient(135deg, var(--primary), var(--secondary))",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
};

const payoutMetaCard = {
  padding: 18,
  borderRadius: 22,
  background: "var(--surface-elevated)",
  border: "1px solid var(--border)",
};

const metaStack = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
  gap: 18,
};

const card = {
  padding: 22,
  borderRadius: 26,
  background: "linear-gradient(180deg, var(--surface), var(--surface-elevated))",
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow-md)",
};

const cardTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  marginBottom: 16,
  flexWrap: "wrap",
};

const billId = {
  color: "var(--text)",
  fontSize: 22,
  fontWeight: 800,
};

const statusBadge = (status) => ({
  padding: "10px 12px",
  borderRadius: 16,
  background:
    status === "paid"
      ? "var(--tone-success-bg)"
      : status === "processing"
        ? "var(--tone-info-bg)"
        : status === "on_hold"
          ? "var(--tone-danger-bg)"
          : "var(--tone-warning-bg)",
  color:
    status === "paid"
      ? "var(--tone-success-text)"
      : status === "processing"
        ? "var(--tone-info-text)"
        : status === "on_hold"
          ? "var(--tone-danger-text)"
          : "var(--tone-warning-text)",
  fontWeight: 800,
});

const metaText = {
  color: "var(--text-secondary)",
  fontSize: 13,
  marginTop: 6,
  lineHeight: 1.5,
  overflowWrap: "anywhere",
};

const amountBadge = {
  padding: "10px 12px",
  borderRadius: 16,
  background: "var(--tone-warning-bg)",
  color: "var(--tone-warning-text)",
  fontWeight: 800,
};

const infoBlock = {
  padding: 16,
  borderRadius: 18,
  background: "var(--surface-elevated)",
  border: "1px solid var(--border)",
  marginBottom: 16,
};

const infoTitle = {
  color: "var(--text)",
  fontWeight: 700,
  fontSize: 16,
};

const infoMeta = {
  color: "var(--text-secondary)",
  marginTop: 6,
  fontSize: 13,
};

const summaryList = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginBottom: 18,
};

const billSettlementMeta = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  fontSize: 12,
  color: "var(--text-secondary)",
  marginBottom: 16,
};

const payoutGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
  gap: 16,
};

const payoutCard = {
  padding: 20,
  borderRadius: 24,
  background: "linear-gradient(180deg, var(--surface), var(--surface-elevated))",
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow-md)",
};

const payoutButtonRow = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))",
  gap: 10,
};

const summaryRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  color: "var(--text)",
  fontSize: 14,
};

const viewButton = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 18,
  border: "1px solid color-mix(in srgb, var(--secondary) 28%, var(--border))",
  background: "linear-gradient(135deg, var(--primary), var(--secondary))",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButton = {
  padding: "14px 16px",
  borderRadius: 18,
  border: "1px solid var(--border)",
  background: "var(--surface-elevated)",
  color: "var(--text)",
  fontWeight: 700,
  cursor: "pointer",
};

const invoice = {
  maxWidth: 960,
};

const invoiceHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 20,
  flexWrap: "wrap",
};

const invoiceEyebrow = {
  color: "var(--secondary)",
  textTransform: "uppercase",
  letterSpacing: 1.4,
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 6,
};

const invoiceTitle = {
  color: "var(--text)",
  fontSize: 32,
  fontWeight: 800,
};

const invoiceTopMeta = {
  color: "var(--text-secondary)",
  textAlign: "right",
  lineHeight: 1.6,
};

const metaGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))",
  gap: 12,
};

const metaCard = {
  padding: 14,
  borderRadius: 18,
  background: "var(--surface-elevated)",
  border: "1px solid var(--border)",
};

const metaLabel = {
  color: "var(--text-secondary)",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 1,
  marginBottom: 8,
};

const metaValue = {
  color: "var(--text)",
  fontWeight: 700,
};

const divider = {
  height: 1,
  background: "var(--border)",
  margin: "22px 0",
};

const panelTitle = {
  color: "var(--text)",
  fontSize: 18,
  fontWeight: 700,
  marginBottom: 14,
};

const invoiceItems = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const invoiceItemRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  color: "var(--text)",
};

const emptyMiniState = {
  color: "var(--text-secondary)",
};

const invoiceSummary = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const invoiceTotalBar = {
  marginTop: 20,
  padding: "16px 18px",
  borderRadius: 18,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  background: "linear-gradient(135deg, var(--primary-soft), var(--secondary-soft))",
  color: "var(--text)",
  border: "1px solid color-mix(in srgb, var(--secondary) 24%, var(--border))",
  fontWeight: 800,
  fontSize: 20,
};

const buttonRow = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 12,
  marginTop: 20,
};
