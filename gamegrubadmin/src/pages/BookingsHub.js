import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

import AdminPageHero from "../components/AdminPageHero";
import Pagination from "../components/Pagination";
import usePagination from "../hooks/usePagination";
import AdminLayout from "../layout/AdminLayout";

import { API_BASE_URL } from "../config/api";
import { useAdminBusiness, withBusinessParams } from "../context/AdminBusinessContext";

const ITEMS_PER_PAGE = 8;

const STATUS_META = {
  confirmed: {
    label: "Confirmed",
    background: "var(--tone-success-bg)",
    border: "var(--tone-success-border)",
    color: "var(--tone-success-text)",
  },
  running: {
    label: "Running",
    background: "var(--tone-warning-bg)",
    border: "var(--tone-warning-border)",
    color: "var(--tone-warning-text)",
  },
  completed: {
    label: "Completed",
    background: "var(--tone-info-bg)",
    border: "var(--tone-info-border)",
    color: "var(--tone-info-text)",
  },
  cancelled: {
    label: "Cancelled",
    background: "var(--tone-danger-bg)",
    border: "var(--tone-danger-border)",
    color: "var(--tone-danger-text)",
  },
};

function formatDateLabel(value) {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatHourLabel(hour) {
  const numericHour = Number(hour);

  if (!Number.isInteger(numericHour)) {
    return null;
  }

  return new Date(
    2026,
    0,
    1,
    ((numericHour % 24) + 24) % 24,
    0,
    0
  ).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatSessionWindow(booking) {
  const dateLabel = formatDateLabel(booking.booking_date);
  const startHour = Number(booking.start_hour);
  const endHour = Number(booking.end_hour);

  if (Number.isInteger(startHour) && Number.isInteger(endHour)) {
    return `${dateLabel}, ${formatHourLabel(startHour)} - ${formatHourLabel(endHour + 1)}`;
  }

  if (booking.time_range) {
    return `${dateLabel}, ${booking.time_range}`;
  }

  return dateLabel;
}

function getStatusMeta(status) {
  if (String(status || "").includes("cancel")) {
    return STATUS_META.cancelled;
  }

  return (
    STATUS_META[status] || {
      label: String(status || "Unknown").replaceAll("_", " ").toUpperCase(),
      background: "var(--surface-elevated)",
      border: "var(--border)",
      color: "var(--text)",
    }
  );
}

function BookingsHub() {
  const { selectedBusiness, selectedBusinessId, loading: businessLoading } = useAdminBusiness();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [error, setError] = useState("");
  const [cancelingId, setCancelingId] = useState(null);

  const loadBookings = useCallback(async () => {
    if (!selectedBusinessId) {
      setBookings([]);
      setLoading(false);
      setError(businessLoading ? "" : "Select a cafe workspace to load its bookings.");
      return;
    }

    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/booking/admin/all`, {
        params: withBusinessParams(selectedBusinessId),
      });
      setBookings(response.data);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to load player bookings.");
    } finally {
      setLoading(false);
    }
  }, [businessLoading, selectedBusinessId]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const counts = useMemo(
    () => ({
      all: bookings.length,
      confirmed: bookings.filter((booking) => booking.status === "confirmed").length,
      running: bookings.filter((booking) => booking.status === "running").length,
      completed: bookings.filter((booking) => booking.status === "completed").length,
      cancelled: bookings.filter((booking) => String(booking.status || "").includes("cancel")).length,
    }),
    [bookings]
  );

  const filteredBookings = useMemo(() => {
    const term = search.trim().toLowerCase();

    return bookings.filter((booking) => {
      const matchesFilter =
        activeFilter === "all"
          ? true
          : activeFilter === "cancelled"
            ? String(booking.status || "").includes("cancel")
            : booking.status === activeFilter;

      const matchesSearch =
        !term ||
        [
          booking.booking_id,
          booking.name,
          booking.specs,
          booking.booking_date,
          booking.time_range,
          booking.booked_at,
          booking.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(term);

      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, bookings, search]);

  const visibleLabel =
    filteredBookings.length === 1 ? "1 booking visible" : `${filteredBookings.length} bookings visible`;

  const {
    currentPage,
    endItem,
    pageItems,
    setCurrentPage,
    startItem,
    totalItems,
    totalPages,
  } = usePagination(filteredBookings, ITEMS_PER_PAGE, [activeFilter, bookings.length, search]);

  const cancelBooking = async (id) => {
    if (!window.confirm("Cancel this reservation?")) {
      return;
    }

    try {
      setCancelingId(id);
      await axios.post(`${API_BASE_URL}/admin/session/cancel`, { booking_id: id });
      await loadBookings();
    } catch (requestError) {
      window.alert(requestError.response?.data?.error || "Could not cancel the reservation.");
    } finally {
      setCancelingId(null);
    }
  };

  return (
    <AdminLayout>
      <AdminPageHero
        eyebrow="Booking Hub"
        title="Bookings"
        subtitle={
          selectedBusiness
            ? `Monitor reservations, live sessions, and handoffs for ${selectedBusiness.name} in one compact queue instead of jumping across repeated booking cards.`
            : "Monitor reservations, live sessions, and handoffs in one compact queue instead of jumping across repeated booking cards."
        }
        chips={[`${counts.confirmed} confirmed`, `${counts.running} live`, selectedBusiness?.name || visibleLabel]}
        badge={{
          title: "Cancelled",
          value: counts.cancelled,
          meta: `${counts.all} total bookings`,
          label: "Session pulse",
        }}
        actions={
          <>
            <input
              className="admin-search"
              style={searchInput}
              placeholder="Search by booking, player, machine, or date"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              type="button"
              className="admin-action-button rig-fleet__refresh-button"
              onClick={loadBookings}
              disabled={loading || !selectedBusinessId}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </>
        }
      />

      <div className="admin-ops-summary">
        <OpsSummaryStat label="Bookings tracked" value={counts.all} meta={visibleLabel} tone="warm" />
        <OpsSummaryStat label="Confirmed" value={counts.confirmed} meta="Upcoming sessions" tone="success" />
        <OpsSummaryStat label="Running" value={counts.running} meta="Active on the floor" tone="warning" />
        <OpsSummaryStat label="Completed" value={counts.completed} meta={`${counts.cancelled} cancelled`} tone="neutral" />
      </div>

      <div className="admin-panel-soft admin-filter-strip">
        <div className="admin-filter-strip__actions">
          {[
            ["all", "All"],
            ["confirmed", "Confirmed"],
            ["running", "Running"],
            ["completed", "Completed"],
            ["cancelled", "Cancelled"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`admin-filter-chip${activeFilter === value ? " is-active" : ""}`}
              onClick={() => setActiveFilter(value)}
            >
              {label} ({counts[value] ?? counts.all})
            </button>
          ))}
        </div>
      </div>

      {error ? <div style={errorBanner}>{error}</div> : null}

      {loading ? (
        <div className="admin-empty-state">Loading bookings...</div>
      ) : filteredBookings.length === 0 ? (
        <div className="admin-empty-state">No bookings found.</div>
      ) : (
        <>
          <div className="admin-panel-soft admin-ops-list-shell">
            <div className="admin-ops-list-shell__header">
              <div>
                <div className="admin-ops-list-shell__eyebrow">Queue</div>
                <div className="admin-ops-list-shell__title">Reservations in view</div>
              </div>
              <div className="admin-ops-list-shell__meta">
                Showing {startItem}-{endItem} of {totalItems}
              </div>
            </div>

            <div className="admin-ops-list">
              {pageItems.map((booking) => {
                const statusMeta = getStatusMeta(booking.status);
                const bookingTitle = booking.name || "Unknown player";

                return (
                  <article
                    key={booking.booking_id}
                    className={`admin-ops-row admin-surface-hover${
                      booking.status === "running" ? " admin-ops-row--attention" : ""
                    }`}
                  >
                    <div className="admin-ops-row__primary">
                      <div className="admin-ops-row__eyebrow">Booking #{booking.booking_id}</div>
                      <div className="admin-ops-row__title">{bookingTitle}</div>
                      <div className="admin-ops-row__meta">
                        Created {formatDateTime(booking.booked_at)}
                      </div>
                    </div>

                    <div className="admin-ops-row__block">
                      <div className="admin-ops-row__label">Setup</div>
                      <div className="admin-ops-row__value">{booking.specs || "Not assigned"}</div>
                      <div className="admin-ops-row__hint">
                        {booking.time_range || "Slot timing will appear once assigned."}
                      </div>
                    </div>

                    <div className="admin-ops-row__block">
                      <div className="admin-ops-row__label">Session window</div>
                      <div className="admin-ops-row__value">{formatSessionWindow(booking)}</div>
                      <div className="admin-ops-row__hint">
                        Date {formatDateLabel(booking.booking_date)}
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
                      {booking.status === "confirmed" ? (
                        <button
                          type="button"
                          className="admin-action-button"
                          style={dangerButton}
                          onClick={() => cancelBooking(booking.booking_id)}
                          disabled={cancelingId === booking.booking_id}
                        >
                          {cancelingId === booking.booking_id ? "Canceling..." : "Cancel booking"}
                        </button>
                      ) : (
                        <div className="admin-ops-note">No action needed for this booking.</div>
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
            label="bookings"
            onPageChange={setCurrentPage}
          />
        </>
      )}
    </AdminLayout>
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

export default BookingsHub;

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

const dangerButton = {
  borderRadius: 16,
  border: "1px solid var(--tone-danger-border)",
  background: "var(--tone-danger-bg)",
  color: "var(--tone-danger-text)",
  fontWeight: 700,
  cursor: "pointer",
  padding: "12px 16px",
};
