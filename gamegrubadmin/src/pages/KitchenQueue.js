import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

import AdminMetricCard from "../components/AdminMetricCard";
import AdminPageHero from "../components/AdminPageHero";
import Pagination from "../components/Pagination";
import usePagination from "../hooks/usePagination";
import AdminLayout from "../layout/AdminLayout";

import { API_BASE_URL } from "../config/api";
import { useAdminBusiness, withBusinessParams } from "../context/AdminBusinessContext";

const POLL_INTERVAL_MS = 5000;
const ITEMS_PER_PAGE = 6;

const FILTERS = [
  { key: "all", label: "All Orders" },
  { key: "accepted", label: "Accepted" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "delivered", label: "Delivered" },
  { key: "closed", label: "Closed" },
];

const STATUS_META = {
  accepted: {
    label: "Accepted",
    color: "var(--tone-warning-text)",
    border: "var(--tone-warning-border)",
    background: "var(--tone-warning-bg)",
  },
  preparing: {
    label: "Preparing",
    color: "var(--tone-info-text)",
    border: "var(--tone-info-border)",
    background: "var(--tone-info-bg)",
  },
  ready: {
    label: "Ready",
    color: "var(--tone-success-text)",
    border: "var(--tone-success-border)",
    background: "var(--tone-success-bg)",
  },
  closed: {
    label: "Closed",
    color: "var(--tone-neutral-text)",
    border: "var(--tone-neutral-border)",
    background: "var(--tone-neutral-bg)",
  },
  delivered: {
    label: "Delivered",
    color: "var(--tone-success-text)",
    border: "var(--tone-success-border)",
    background: "var(--tone-success-bg)",
  },
};

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDateTime(value) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getStatusMeta(status) {
  return STATUS_META[status] || STATUS_META.accepted;
}

function nextStatusFor(status) {
  return {
    accepted: "preparing",
    preparing: "ready",
    ready: "delivered",
  }[status] || "";
}

function defaultEtaMinutes(order) {
  const itemPrepTime = Math.max(
    0,
    ...(order.items || []).map((item) => Number(item.prep_time_minutes || 0)),
  );
  return Number(order.eta_minutes || 0) || Math.max(10, itemPrepTime);
}

function matchesSearch(order, query) {
  if (!query) return true;

  const lowerQuery = query.trim().toLowerCase();

  if (!lowerQuery) return true;

  const searchableFields = [
    String(order.order_id),
    String(order.booking_id),
    String(order.pc_id),
    order.user_name,
    order.pc_specs,
    order.booking_status,
    ...(order.items || []).map((item) => item.name),
  ];

  return searchableFields.some((value) =>
    String(value || "").toLowerCase().includes(lowerQuery)
  );
}

function KitchenQueue() {
  const { selectedBusiness, selectedBusinessId, loading: businessLoading } = useAdminBusiness();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [updatingOrderId, setUpdatingOrderId] = useState(null);
  const [etaMinutesByOrder, setEtaMinutesByOrder] = useState({});

  const loadOrders = useCallback(async ({ silent = false } = {}) => {
    if (!selectedBusinessId) {
      setOrders([]);
      setError(businessLoading ? "" : "Select a cafe workspace to load its orders.");
      setNotice("");
      if (!silent) {
        setLoading(false);
      }
      return;
    }

    if (!silent) {
      setLoading(true);
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/order/admin/list`, {
        params: withBusinessParams(selectedBusinessId),
      });
      setOrders(response.data);
      setLastUpdated(new Date());
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to load orders.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [businessLoading, selectedBusinessId]);

  useEffect(() => {
    if (!selectedBusinessId) {
      setLoading(false);
      return undefined;
    }

    loadOrders();

    const interval = setInterval(() => {
      loadOrders({ silent: true });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [loadOrders, selectedBusinessId]);

  const counts = useMemo(
    () => ({
      all: orders.length,
      accepted: orders.filter((order) => order.status === "accepted").length,
      preparing: orders.filter((order) => order.status === "preparing").length,
      ready: orders.filter((order) => order.status === "ready").length,
      delivered: orders.filter((order) => order.status === "delivered").length,
      closed: orders.filter((order) => order.status === "closed").length,
    }),
    [orders]
  );

  const openValue = useMemo(
    () =>
      orders
        .filter((order) => order.status !== "closed")
        .reduce((sum, order) => sum + Number(order.total_amount || 0), 0),
    [orders]
  );

  const visibleOrders = useMemo(
    () =>
      orders.filter((order) => {
        const matchesFilter = selectedFilter === "all" ? true : order.status === selectedFilter;
        return matchesFilter && matchesSearch(order, search);
      }),
    [orders, search, selectedFilter]
  );
  const visibleLabel =
    visibleOrders.length === 1 ? "1 order visible" : `${visibleOrders.length} orders visible`;

  const {
    currentPage,
    endItem,
    pageItems,
    setCurrentPage,
    startItem,
    totalItems,
    totalPages,
  } = usePagination(visibleOrders, ITEMS_PER_PAGE, [orders.length, search, selectedFilter]);

  const updateOrderStatus = async (orderId, nextStatus, etaMinutes) => {
    setUpdatingOrderId(orderId);
    setNotice("");

    try {
      await axios.put(`${API_BASE_URL}/order/status/${orderId}`, {
        status: nextStatus,
        ...(etaMinutes ? { eta_minutes: Number(etaMinutes) } : {}),
      });

      setNotice(`Order #${orderId} updated to ${getStatusMeta(nextStatus).label}.`);
      await loadOrders({ silent: true });
    } catch (requestError) {
      setError(
        requestError.response?.data?.error ||
          "Unable to update order status. Please try again."
      );
    } finally {
      setUpdatingOrderId(null);
    }
  };

  return (
    <AdminLayout>
      <AdminPageHero
        eyebrow="Kitchen Queue"
        title="Orders"
        subtitle={
          selectedBusiness
            ? `Keep ${selectedBusiness.name}'s kitchen board moving with a consistent live queue, status controls, and cash impact in view.`
            : "Keep the kitchen board moving with a consistent live queue, status controls, and cash impact in view."
        }
        chips={[
          `${counts.accepted} accepted`,
          `${counts.preparing} preparing`,
          selectedBusiness?.name || visibleLabel,
        ]}
        badge={{
          title: "Open value",
          value: formatCurrency(openValue),
          meta: `Updated ${lastUpdated ? formatDateTime(lastUpdated) : "Loading..."}`,
          label: "Live kitchen",
        }}
        actions={
          <button
            type="button"
            className="admin-action-button rig-fleet__refresh-button"
            onClick={() => loadOrders()}
            disabled={!selectedBusinessId || loading}
          >
            Refresh</button>
        }
      />

      <div className="admin-metric-grid">
        <AdminMetricCard icon="ALL" label="Total" value={counts.all} hint={visibleLabel} tone="neutral" />
        <AdminMetricCard icon="NEW" label="Accepted" value={counts.accepted} hint="Fresh tickets" tone="warm" />
        <AdminMetricCard
          icon="PREP"
          label="Preparing"
          value={counts.preparing}
          hint="Currently in kitchen"
          tone="info"
        />
        <AdminMetricCard
          icon="DONE"
          label="Ready"
          value={counts.ready}
          hint={`${counts.delivered} delivered · ${counts.closed} closed`}
          tone="cool"
        />
      </div>

      <div className="admin-panel-soft admin-filter-strip" style={toolbar}>
        <input
          className="admin-search"
          style={searchInput}
          placeholder="Search by order, booking, PC, user, or item"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <div className="admin-filter-strip__actions" style={filtersWrap}>
          {FILTERS.map((filter) => {
            const active = selectedFilter === filter.key;

            return (
              <button
                key={filter.key}
                type="button"
                className={`admin-filter-chip${active ? " is-active" : ""}`}
                onClick={() => setSelectedFilter(filter.key)}
              >
                {filter.label} ({counts[filter.key] ?? 0})
              </button>
            );
          })}
        </div>
      </div>

      {error ? <div style={errorBanner}>{error}</div> : null}
      {notice ? <div style={successBanner}>{notice}</div> : null}

      {loading ? (
        <div className="admin-empty-state">Loading orders...</div>
      ) : visibleOrders.length === 0 ? (
        <div className="admin-empty-state">No orders found.</div>
      ) : (
        <>
          <div style={ordersGrid}>
            {pageItems.map((order) => {
              const statusMeta = getStatusMeta(order.status);

              return (
                <div key={order.order_id} className="admin-surface-hover" style={orderCard(statusMeta.border)}>
                  <div style={cardTop}>
                    <div>
                      <div style={orderIdText}>Order #{order.order_id}</div>
                      <div style={orderMetaText}>
                        Booking #{order.booking_id} | PC {order.pc_id}
                      </div>
                    </div>

                    <div
                      style={{
                        ...statusBadge,
                        color: statusMeta.color,
                        borderColor: statusMeta.border,
                        background: statusMeta.background,
                      }}
                    >
                      {statusMeta.label}
                    </div>
                  </div>

                  <div style={detailsGrid}>
                    <Detail label="Customer" value={order.user_name} />
                    <Detail label="Session status" value={order.booking_status} />
                    <Detail label="Session started" value={formatDateTime(order.start_time)} />
                    <Detail label="Items" value={String(order.total_items)} />
                    <Detail label="Accepted" value={formatDateTime(order.accepted_at)} />
                    {order.preparing_at ? <Detail label="Preparing" value={formatDateTime(order.preparing_at)} /> : null}
                    {order.ready_at ? <Detail label="Ready" value={formatDateTime(order.ready_at)} /> : null}
                    {order.delivered_at ? <Detail label="Delivered" value={formatDateTime(order.delivered_at)} /> : null}
                    {order.eta_at && order.status === "preparing" ? (
                      <Detail label="Estimated ready" value={formatDateTime(order.eta_at)} />
                    ) : null}
                  </div>

                  <div style={pcSpecs}>{order.pc_specs}</div>

                  {order.customer_notes ? (
                    <div style={{ ...itemsCard, marginBottom: 14 }}>
                      <div style={itemsTitle}>Customer note</div>
                      <div style={itemMeta}>{order.customer_notes}</div>
                    </div>
                  ) : null}

                  <div style={itemsCard}>
                    <div style={itemsTitle}>Items</div>

                    {(order.items || []).length ? (
                      <div style={itemsList}>
                        {order.items.map((item) => (
                          <div key={item.item_id} style={itemRow}>
                            <div>
                              <div style={itemName}>{item.name}</div>
                              <div style={itemMeta}>
                                Qty {item.qty} | {formatCurrency(item.price)} each
                              </div>
                            </div>

                            <div style={itemTotal}>{formatCurrency(item.total)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={emptyItems}>No items found for this order.</div>
                    )}
                  </div>

                  <div style={cardFooter}>
                    <div>
                      <div style={footerLabel}>Order total</div>
                      <div style={footerValue}>{formatCurrency(order.total_amount)}</div>
                    </div>

                    {order.status === "closed" ? (
                      <div style={closedPill}>Included in bill</div>
                    ) : (
                      <div style={actionsWrap}>
                        {order.status === "preparing" ? (
                          <>
                            <input
                              className="admin-search"
                              aria-label={`ETA minutes for order ${order.order_id}`}
                              type="number"
                              min="1"
                              max="240"
                              value={etaMinutesByOrder[order.order_id] || defaultEtaMinutes(order)}
                              onChange={(event) => setEtaMinutesByOrder((current) => ({
                                ...current,
                                [order.order_id]: event.target.value,
                              }))}
                              style={{ width: 116 }}
                            />
                            <button
                              type="button"
                              className="admin-action-button"
                              onClick={() => updateOrderStatus(
                                order.order_id,
                                "preparing",
                                etaMinutesByOrder[order.order_id] || defaultEtaMinutes(order),
                              )}
                              disabled={updatingOrderId === order.order_id}
                            >
                              Update ETA
                            </button>
                          </>
                        ) : null}
                        {nextStatusFor(order.status) ? (
                          <button
                            type="button"
                            className="admin-action-button"
                            style={statusActionButton(getStatusMeta(nextStatusFor(order.status)), false)}
                            onClick={() => updateOrderStatus(
                              order.order_id,
                              nextStatusFor(order.status),
                              order.status === "accepted"
                                ? etaMinutesByOrder[order.order_id] || defaultEtaMinutes(order)
                                : undefined,
                            )}
                            disabled={updatingOrderId === order.order_id}
                          >
                            {updatingOrderId === order.order_id
                              ? "Saving..."
                              : `Mark ${getStatusMeta(nextStatusFor(order.status)).label}`}
                          </button>
                        ) : order.status === "delivered" ? (
                          <div style={closedPill}>Delivered</div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            startItem={startItem}
            endItem={endItem}
            label="orders"
            onPageChange={setCurrentPage}
          />
        </>
      )}
    </AdminLayout>
  );
}

function Detail({ label, value }) {
  return (
    <div style={detailBlock}>
      <div style={detailLabel}>{label}</div>
      <div style={detailValue}>{value || "-"}</div>
    </div>
  );
}

export default KitchenQueue;

const toolbar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 20,
  flexWrap: "wrap",
};

const searchInput = {
  flex: 1,
};

const filtersWrap = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const errorBanner = {
  marginBottom: 16,
  padding: 14,
  borderRadius: 14,
  border: "1px solid var(--tone-danger-border)",
  background: "var(--tone-danger-bg)",
  color: "var(--tone-danger-text)",
};

const successBanner = {
  marginBottom: 16,
  padding: 14,
  borderRadius: 14,
  border: "1px solid var(--tone-success-border)",
  background: "var(--tone-success-bg)",
  color: "var(--tone-success-text)",
};

const ordersGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
  gap: 22,
};

const orderCard = (borderColor) => ({
  padding: 22,
  borderRadius: 24,
  background: "var(--surface)",
  border: `1px solid ${borderColor}`,
  boxShadow: "var(--shadow-md)",
  display: "flex",
  flexDirection: "column",
  gap: 18,
});

const cardTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
};

const orderIdText = {
  color: "var(--text)",
  fontSize: 22,
  fontWeight: 700,
};

const orderMetaText = {
  color: "var(--text-secondary)",
  marginTop: 4,
  fontSize: 13,
};

const statusBadge = {
  padding: "8px 12px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  border: "1px solid transparent",
  whiteSpace: "nowrap",
};

const detailsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
  gap: 14,
};

const detailBlock = {
  padding: 12,
  borderRadius: 14,
  background: "var(--surface-elevated)",
  border: "1px solid var(--border)",
};

const detailLabel = {
  color: "var(--text-secondary)",
  fontSize: 12,
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: 0.6,
};

const detailValue = {
  color: "var(--text)",
  fontSize: 14,
  lineHeight: 1.4,
  overflowWrap: "anywhere",
};

const pcSpecs = {
  color: "var(--text-secondary)",
  fontSize: 13,
  overflowWrap: "anywhere",
};

const itemsCard = {
  borderRadius: 18,
  padding: 16,
  background: "var(--surface-elevated)",
  border: "1px solid var(--border)",
};

const itemsTitle = {
  color: "var(--text)",
  fontWeight: 600,
  marginBottom: 14,
};

const itemsList = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const itemRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  paddingBottom: 12,
  borderBottom: "1px solid var(--border)",
};

const itemName = {
  color: "var(--text)",
  fontWeight: 600,
  marginBottom: 4,
};

const itemMeta = {
  color: "var(--text-secondary)",
  fontSize: 12,
};

const itemTotal = {
  color: "var(--text)",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const emptyItems = {
  color: "var(--text-secondary)",
  fontSize: 13,
};

const cardFooter = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-end",
  gap: 16,
  flexWrap: "wrap",
};

const footerLabel = {
  color: "var(--text-secondary)",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  marginBottom: 6,
};

const footerValue = {
  color: "var(--text)",
  fontSize: 28,
  fontWeight: 700,
};

const actionsWrap = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const statusActionButton = (statusMeta, isCurrent) => ({
  borderRadius: 14,
  border: `1px solid ${statusMeta.border}`,
  padding: "10px 12px",
  background: isCurrent ? statusMeta.background : "var(--surface-elevated)",
  color: isCurrent ? statusMeta.color : "var(--text)",
  fontWeight: 600,
  cursor: isCurrent ? "default" : "pointer",
  opacity: isCurrent ? 0.7 : 1,
});

const closedPill = {
  padding: "10px 14px",
  borderRadius: 999,
  background: "var(--surface-elevated)",
  border: "1px solid var(--border)",
  color: "var(--text-secondary)",
  fontWeight: 600,
  fontSize: 12,
};
