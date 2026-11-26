import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import AdminLayout from "../layout/AdminLayout";
import AdminPageHero from "../components/AdminPageHero";
import { API_BASE_URL } from "../config/api";
import { getAdminProfile } from "../config/adminSession";
import { useAdminBusiness, withBusinessParams } from "../context/AdminBusinessContext";
import OperationsMonitor from "../components/OperationsMonitor";

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

function formatDay(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) return "Pending";
  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function prettifyStatus(status) {
  return String(status || "unknown")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Dashboard() {
  const { selectedBusiness, selectedBusinessId, loading: businessLoading } = useAdminBusiness();
  const isSuperAdmin = getAdminProfile()?.role === "super_admin";
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    if (!selectedBusinessId) {
      setDashboard(null);
      setLoading(false);
      setError(businessLoading ? "" : "Select a cafe workspace to load the dashboard.");
      return;
    }

    try {
      setLoading(true);
      const params = withBusinessParams(selectedBusinessId);
      const [dashboardResponse, settlementResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/admin/dashboard`, { params }),
        axios.get(`${API_BASE_URL}/admin/settlements/summary`, { params }),
      ]);
      setDashboard({
        ...dashboardResponse.data,
        settlement_summary: settlementResponse.data,
      });
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Could not load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [businessLoading, selectedBusinessId]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const summary = dashboard?.summary || {};
  const revenueSeries = (dashboard?.revenue_series || []).map((item) => ({
    ...item,
    label: formatDay(item.day),
  }));
  const peakHourSeries = (dashboard?.peak_hour_series || []).map((item) => ({
    ...item,
    label: `${String(item.hour).padStart(2, "0")}:00`,
  }));
  const topMenuItems = dashboard?.top_menu_items || [];
  const topCustomers = dashboard?.top_customers || [];
  const recentPayments = dashboard?.recent_payments || [];
  const liveSessions = dashboard?.live_sessions || [];
  const settlementSummary = dashboard?.settlement_summary || {};
  const recentPayouts = settlementSummary.recent_payouts || [];

  const totalStations =
    summary.total_pcs ?? summary.total_stations ?? summary.total_machines ?? null;
  const occupiedStations = summary.occupied_pcs ?? summary.active_sessions ?? 0;
  const availableStations =
    summary.available_pcs ?? summary.free_pcs ?? summary.open_pcs ?? null;
  const occupancyBase =
    totalStations ?? (availableStations != null ? occupiedStations + availableStations : null);
  const openStations =
    availableStations ?? (occupancyBase != null ? Math.max(occupancyBase - occupiedStations, 0) : null);
  const occupancyRate = occupancyBase ? Math.round((occupiedStations / occupancyBase) * 100) : null;
  const avgTicket =
    Number(summary.total_bookings || 0) > 0
      ? Number(summary.total_revenue || 0) / Number(summary.total_bookings || 0)
      : 0;
  const peakHourLabel = peakHourSeries.length
    ? peakHourSeries.reduce((currentPeak, candidate) =>
        candidate.total_bookings > currentPeak.total_bookings ? candidate : currentPeak
      ).label
    : "No peak yet";

  const keyMetrics = [
    {
      label: "Today revenue",
      value: formatCurrency(summary.today_revenue),
      meta: `${summary.today_bookings ?? 0} bookings settled today`,
      tone: "warm",
    },
    {
      label: "Open setups",
      value: openStations == null ? "--" : formatNumber(openStations),
      meta: totalStations == null ? "Floor total unavailable" : `${totalStations} setups on the floor`,
      tone: "success",
    },
    {
      label: "Active sessions",
      value: formatNumber(summary.active_sessions ?? occupiedStations),
      meta: peakHourLabel === "No peak yet" ? "No peak hour captured yet" : `Peak start window ${peakHourLabel}`,
      tone: "warning",
    },
    {
      label: "Average ticket",
      value: avgTicket > 0 ? formatCurrency(avgTicket) : "Rs 0",
      meta: `${formatNumber(summary.total_users)} tracked players`,
      tone: "info",
    },
    {
      label: "Pending seller payout",
      value: formatCurrency(settlementSummary.unsettled_seller_net_amount),
      meta: `${formatNumber(settlementSummary.unsettled_bill_count)} bills not batched yet`,
      tone: "gold",
    },
  ];

  return (
    <AdminLayout>
      <AdminPageHero
        eyebrow="Control room"
        title="Floor snapshot"
        subtitle={
          selectedBusiness
            ? `A cleaner operating view for ${selectedBusiness.name}, covering revenue, live occupancy, bookings, and settlement movement.`
            : "A cleaner operating view for revenue, live occupancy, bookings, and settlement movement."
        }
        chips={[
          `${summary.today_bookings ?? 0} bookings today`,
          `${formatNumber(summary.total_users)} players tracked`,
          selectedBusiness?.name || "Cafe workspace pending",
        ]}
        actions={
          <button
            type="button"
            className="dashboard-action dashboard-action--primary"
            onClick={loadDashboard}
            disabled={!selectedBusinessId || loading}
          >
            Refresh dashboard
          </button>
        }
        badge={{
          title: "Live occupancy",
          value: occupancyRate == null ? "--" : `${occupancyRate}%`,
          meta:
            totalStations == null
              ? `${occupiedStations} stations active right now`
              : `${openStations ?? 0} open of ${totalStations} total setups`,
          label: "Live floor",
        }}
      />

      {loading ? (
        <div className="dashboard-panel dashboard-panel--full">
          <div className="dashboard-placeholder">Loading dashboard...</div>
        </div>
      ) : error ? (
        <div className="dashboard-panel dashboard-panel--full">
          <div className="dashboard-placeholder">{error}</div>
        </div>
      ) : (
        <>
          <section className="dashboard-kpi-strip">
            {keyMetrics.map((metric) => (
              <DashboardKpi key={metric.label} {...metric} />
            ))}
          </section>

          <div className="dashboard-grid">
            {isSuperAdmin ? <OperationsMonitor /> : null}
            <DashboardPanel
              className="dashboard-panel dashboard-panel--wide admin-surface-hover"
              eyebrow="Revenue analytics"
              title="Collections trend"
              subtitle="Daily revenue from settled sessions and food orders."
            >
              {revenueSeries.length ? (
                <div className="dashboard-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueSeries}>
                      <defs>
                        <linearGradient id="dashboardRevenueFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ff3d57" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#ff3d57" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" stroke="var(--text-secondary)" tickLine={false} axisLine={false} />
                      <YAxis
                        stroke="var(--text-secondary)"
                        tickFormatter={(value) => `${Math.round(value / 1000)}k`}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(value) => formatCurrency(value)}
                        labelFormatter={(value) => value}
                        contentStyle={tooltipStyle}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#ff3d57"
                        strokeWidth={2.5}
                        fill="url(#dashboardRevenueFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="dashboard-placeholder">No revenue data yet.</div>
              )}
            </DashboardPanel>

            <DashboardPanel
              className="dashboard-panel dashboard-panel--narrow admin-surface-hover"
              eyebrow="Today at a glance"
              title="Operational summary"
              subtitle="A compact readout of the most actionable numbers."
            >
              <div className="dashboard-highlight">
                <div className="dashboard-kv">
                  <span className="dashboard-kv__label">Open kitchen value</span>
                  <div className="dashboard-kv__value">{formatCurrency(summary.open_order_value)}</div>
                </div>
                <div className="dashboard-kv">
                  <span className="dashboard-kv__label">Average session</span>
                  <div className="dashboard-kv__value">{summary.avg_session_minutes ?? 0} min</div>
                </div>
                <div className="dashboard-kv">
                  <span className="dashboard-kv__label">Rewards outstanding</span>
                  <div className="dashboard-kv__value">{formatNumber(summary.loyalty_outstanding)} pts</div>
                </div>
                <div className="dashboard-kv">
                  <span className="dashboard-kv__label">Peak booking hour</span>
                  <div className="dashboard-kv__value">{peakHourLabel}</div>
                </div>
              </div>
            </DashboardPanel>

            <DashboardPanel
              className="dashboard-panel dashboard-panel--narrow admin-surface-hover"
              eyebrow="Settlement ledger"
              title="Commission and payout runway"
              subtitle="Seller take-home, platform earnings, and manual payout movement from the shared fee ledger."
            >
              <div className="dashboard-highlight">
                <div className="dashboard-kv">
                  <span className="dashboard-kv__label">Seller net pending</span>
                  <div className="dashboard-kv__value">
                    {formatCurrency(settlementSummary.unsettled_seller_net_amount)}
                  </div>
                </div>
                <div className="dashboard-kv">
                  <span className="dashboard-kv__label">Platform take</span>
                  <div className="dashboard-kv__value">
                    {formatCurrency(settlementSummary.platform_take_amount)}
                  </div>
                </div>
                <div className="dashboard-kv">
                  <span className="dashboard-kv__label">Paid out</span>
                  <div className="dashboard-kv__value">
                    {formatCurrency(settlementSummary.paid_payout_amount)}
                  </div>
                </div>
                <div className="dashboard-kv">
                  <span className="dashboard-kv__label">In-flight batches</span>
                  <div className="dashboard-kv__value">
                    {formatNumber(
                      Number(settlementSummary.pending_payout_count || 0) +
                        Number(settlementSummary.processing_payout_count || 0) +
                        Number(settlementSummary.on_hold_payout_count || 0)
                    )}
                  </div>
                </div>
              </div>
            </DashboardPanel>

            <DashboardPanel
              className="dashboard-panel dashboard-panel--narrow admin-surface-hover"
              eyebrow="Booking rhythm"
              title="Peak starts"
              subtitle="The busiest session start windows across the floor."
            >
              {peakHourSeries.length ? (
                <div className="dashboard-chart dashboard-chart--compact">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={peakHourSeries}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" stroke="var(--text-secondary)" tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--text-secondary)" tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="total_bookings" radius={[10, 10, 0, 0]} fill="#7c5cff" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="dashboard-placeholder">No booking-hour data yet.</div>
              )}
            </DashboardPanel>

            <DashboardPanel
              className="dashboard-panel dashboard-panel--full admin-surface-hover"
              eyebrow="Payout batches"
              title="Latest settlement batches"
              subtitle="A quick read on what has been requested, what is in motion, and what the platform has already released."
            >
              {recentPayouts.length ? (
                <div className="dashboard-list">
                  {recentPayouts.map((payout) => (
                    <div key={payout.payout_id} className="dashboard-list-item">
                      <div>
                        <div className="dashboard-list-item__title">
                          Batch #{payout.payout_id} | {prettifyStatus(payout.status)}
                        </div>
                        <div className="dashboard-list-item__meta">
                          {`${payout.bill_count} bills | ${payout.period_start || "?"} to ${
                            payout.period_end || "?"
                          }`}
                          {payout.payout_reference ? ` | ${payout.payout_reference}` : ""}
                        </div>
                      </div>
                      <div>
                        <div className="dashboard-list-item__value">
                          {formatCurrency(payout.seller_net_amount)}
                        </div>
                        <div className="dashboard-list-item__status">
                          {formatDateTime(payout.paid_at || payout.requested_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="dashboard-placeholder dashboard-placeholder--compact">
                  No payout batches requested yet.
                </div>
              )}
            </DashboardPanel>

            <DashboardPanel
              className="dashboard-panel dashboard-panel--full admin-surface-hover"
              eyebrow="Live floor"
              title="Sessions and settlements"
              subtitle="Track who is playing right now and the latest payment movement without bouncing across cards."
            >
              <div className="dashboard-split-grid">
                <DashboardSubsection
                  title="Active sessions"
                  meta={liveSessions.length ? `${liveSessions.length} live` : "No active sessions"}
                >
                  {liveSessions.length ? (
                    <div className="dashboard-list">
                      {liveSessions.map((session) => (
                        <div key={session.booking_id} className="dashboard-list-item">
                          <div>
                            <div className="dashboard-list-item__title">
                              {session.user_name} | PC {session.pc_id}
                            </div>
                            <div className="dashboard-list-item__meta">{session.pc_specs}</div>
                          </div>
                          <div>
                            <div className="dashboard-list-item__value">{session.running_minutes} min</div>
                            <div className="dashboard-list-item__status">{formatDateTime(session.start_time)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="dashboard-placeholder dashboard-placeholder--compact">
                      No active sessions right now.
                    </div>
                  )}
                </DashboardSubsection>

                <DashboardSubsection
                  title="Recent payments"
                  meta={recentPayments.length ? `${recentPayments.length} latest settlements` : "No recent payments"}
                >
                  {recentPayments.length ? (
                    <div className="dashboard-list">
                      {recentPayments.map((payment) => (
                        <div key={payment.payment_id} className="dashboard-list-item">
                          <div>
                            <div className="dashboard-list-item__title">
                              {payment.user_name} | Booking #{payment.booking_id}
                            </div>
                            <div className="dashboard-list-item__meta">
                              {prettifyStatus(payment.payment_method)}
                              {payment.payment_reference ? ` | ${payment.payment_reference}` : ""}
                              {` | ${formatDateTime(payment.paid_on)}`}
                            </div>
                          </div>
                          <div>
                            <div className="dashboard-list-item__value">
                              {formatCurrency(payment.final_amount)}
                            </div>
                            <div className="dashboard-list-item__status">
                              {prettifyStatus(payment.status)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="dashboard-placeholder dashboard-placeholder--compact">
                      No recent payments recorded.
                    </div>
                  )}
                </DashboardSubsection>
              </div>
            </DashboardPanel>

            <DashboardPanel
              className="dashboard-panel dashboard-panel--full admin-surface-hover"
              eyebrow="Revenue drivers"
              title="Players and kitchen leaders"
              subtitle="See who is driving spend and which menu items are carrying the day."
            >
              <div className="dashboard-split-grid">
                <DashboardSubsection
                  title="Top players"
                  meta={topCustomers.length ? `${topCustomers.length} visible` : "No spend data yet"}
                >
                  {topCustomers.length ? (
                    <div className="dashboard-list">
                      {topCustomers.map((customer) => (
                        <div key={customer.uid} className="dashboard-list-item">
                          <div>
                            <div className="dashboard-list-item__title">{customer.name}</div>
                            <div className="dashboard-list-item__meta">
                              {customer.bill_count} bills | {customer.loyalty_points} pts
                            </div>
                          </div>
                          <div className="dashboard-list-item__value">
                            {formatCurrency(customer.total_spend)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="dashboard-placeholder dashboard-placeholder--compact">
                      No customer spend data yet.
                    </div>
                  )}
                </DashboardSubsection>

                <DashboardSubsection
                  title="Top menu items"
                  meta={topMenuItems.length ? `${topMenuItems.length} visible` : "No menu data yet"}
                >
                  {topMenuItems.length ? (
                    <div className="dashboard-list">
                      {topMenuItems.map((item, index) => (
                        <div key={`${item.name}-${index}`} className="dashboard-list-item">
                          <div>
                            <div className="dashboard-list-item__title">{item.name}</div>
                            <div className="dashboard-list-item__meta">
                              {item.category} | {item.qty_sold} sold
                            </div>
                          </div>
                          <div className="dashboard-list-item__value">
                            {formatCurrency(item.revenue)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="dashboard-placeholder dashboard-placeholder--compact">
                      No menu revenue data yet.
                    </div>
                  )}
                </DashboardSubsection>
              </div>
            </DashboardPanel>
          </div>
        </>
      )}
    </AdminLayout>
  );
}

function DashboardKpi({ label, value, meta, tone }) {
  return (
    <article className={`dashboard-kpi dashboard-kpi--${tone}`}>
      <div className="dashboard-kpi__label">{label}</div>
      <div className="dashboard-kpi__value">{value}</div>
      <div className="dashboard-kpi__meta">{meta}</div>
    </article>
  );
}

function DashboardPanel({ className, eyebrow, title, subtitle, meta = null, children }) {
  return (
    <section className={className}>
      <div className="dashboard-panel__header">
        <div>
          {eyebrow ? <div className="dashboard-panel__eyebrow">{eyebrow}</div> : null}
          <div className="dashboard-panel__title">{title}</div>
          {subtitle ? <div className="dashboard-panel__subtitle">{subtitle}</div> : null}
        </div>
        {meta}
      </div>
      {children}
    </section>
  );
}

function DashboardSubsection({ title, meta, children }) {
  return (
    <section className="dashboard-subsection">
      <div className="dashboard-subsection__header">
        <div className="dashboard-subsection__title">{title}</div>
        <div className="dashboard-subsection__meta">{meta}</div>
      </div>
      {children}
    </section>
  );
}

const tooltipStyle = {
  background: "var(--surface-elevated)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  color: "var(--text)",
  boxShadow: "var(--shadow-md)",
};

export default Dashboard;
