import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

import AdminPageHero from "../components/AdminPageHero";
import Pagination from "../components/Pagination";
import usePagination from "../hooks/usePagination";
import AdminLayout from "../layout/AdminLayout";

import { API_BASE_URL } from "../config/api";
import { useAdminBusiness, withBusinessParams } from "../context/AdminBusinessContext";
import {
  ADMIN_PERMISSIONS,
  getAdminProfile,
  hasAdminPermission,
} from "../config/adminSession";

const ITEMS_PER_PAGE = 8;

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatDateTime(value) {
  if (!value) {
    return "No activity";
  }

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getTier(points) {
  if (points >= 5000) {
    return "Legend";
  }
  if (points >= 2000) {
    return "Pro";
  }
  if (points >= 500) {
    return "Regular";
  }
  return "Starter";
}

function PlayersHub() {
  const admin = getAdminProfile();
  const { selectedBusiness, selectedBusinessId, loading: businessLoading } = useAdminBusiness();
  const canManageLoyalty = hasAdminPermission(ADMIN_PERMISSIONS.LOYALTY_MANAGE, admin);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadUsers = useCallback(async () => {
    if (!selectedBusinessId) {
      setUsers([]);
      setLoading(false);
      setError(businessLoading ? "" : "Select a cafe workspace to load its players.");
      return;
    }

    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/admin/users`, {
        params: withBusinessParams(selectedBusinessId),
      });
      setUsers(response.data);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to load players.");
    } finally {
      setLoading(false);
    }
  }, [businessLoading, selectedBusinessId]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const visibleUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return users;
    }

    return users.filter((user) =>
      [user.name, user.gamer_tag, user.favorite_game, user.email, user.mobile]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [search, users]);

  const {
    currentPage,
    endItem,
    pageItems,
    setCurrentPage,
    startItem,
    totalItems,
    totalPages,
  } = usePagination(visibleUsers, ITEMS_PER_PAGE, [search, users.length]);

  const totals = useMemo(
    () => ({
      legends: users.filter((user) => Number(user.loyalty_points || 0) >= 5000).length,
      loyalty: users.reduce((sum, user) => sum + Number(user.loyalty_points || 0), 0),
      spend: users.reduce((sum, user) => sum + Number(user.lifetime_spend || 0), 0),
      ranked: users.filter((user) => Number(user.tournament_points || 0) > 0).length,
      champions: users.reduce((sum, user) => sum + Number(user.tournament_championships || 0), 0),
      total: users.length,
    }),
    [users]
  );

  const visibleLabel =
    visibleUsers.length === 1 ? "1 player visible" : `${visibleUsers.length} players visible`;

  const updatePoints = async (id, current) => {
    if (!canManageLoyalty) {
      window.alert("Only super admins can edit loyalty balances.");
      return;
    }

    const value = window.prompt("Enter loyalty points:", current);

    if (value === null) {
      return;
    }

    const points = Number(value.trim());

    if (!Number.isFinite(points) || points < 0) {
      window.alert("Please enter a valid non-negative number.");
      return;
    }

    await axios.put(`${API_BASE_URL}/admin/user/loyalty/${id}`, { points });
    await loadUsers();
  };

  return (
    <AdminLayout>
      <AdminPageHero
        eyebrow="Player Hub"
        title="Players"
        subtitle={
          selectedBusiness
            ? `Review loyalty, spend, and tournament standing for ${selectedBusiness.name} in a single player list instead of scanning repeated stat cards.`
            : "Review loyalty, spend, and tournament standing in a single player list instead of scanning repeated stat cards."
        }
        chips={[`${totals.legends} legends`, `${totals.ranked} ranked`, selectedBusiness?.name || visibleLabel]}
        badge={{
          title: "Lifetime spend",
          value: formatCurrency(totals.spend),
          meta: `${totals.total} registered players`,
          label: "Community pulse",
        }}
        actions={
          <>
            <input
              className="admin-search"
              style={searchInput}
              placeholder="Search by name, email, gamer tag, or mobile"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              type="button"
              className="admin-action-button rig-fleet__refresh-button"
              onClick={loadUsers}
              disabled={loading || !selectedBusinessId}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </>
        }
      />

      <div className="admin-ops-summary">
        <OpsSummaryStat label="Players" value={totals.total} meta={visibleLabel} tone="warm" />
        <OpsSummaryStat label="Top tier" value={totals.legends} meta="Legend loyalty members" tone="success" />
        <OpsSummaryStat label="Total loyalty" value={`${totals.loyalty} pts`} meta="Current reward balance" tone="warning" />
        <OpsSummaryStat label="Ranked" value={totals.ranked} meta={`${totals.champions} total titles`} tone="neutral" />
      </div>

      {error ? <div style={errorBanner}>{error}</div> : null}

      {loading ? (
        <div className="admin-empty-state">Loading players...</div>
      ) : visibleUsers.length === 0 ? (
        <div className="admin-empty-state">No players found.</div>
      ) : (
        <>
          <div className="admin-panel-soft admin-ops-list-shell">
            <div className="admin-ops-list-shell__header">
              <div>
                <div className="admin-ops-list-shell__eyebrow">Roster</div>
                <div className="admin-ops-list-shell__title">Players in view</div>
              </div>
              <div className="admin-ops-list-shell__meta">
                Showing {startItem}-{endItem} of {totalItems}
              </div>
            </div>

            <div className="admin-ops-list">
              {pageItems.map((user) => {
                const tier = getTier(Number(user.loyalty_points || 0));
                const winRate = Number(user.tournament_win_rate || 0).toFixed(1);

                return (
                  <article key={user.uid} className="admin-ops-row admin-surface-hover">
                    <div className="admin-ops-row__primary">
                      <div className="admin-ops-row__identity">
                        <div className="admin-ops-row__avatar">{user.name?.slice(0, 1) || "P"}</div>
                        <div>
                          <div className="admin-ops-row__eyebrow">Player profile</div>
                          <div className="admin-ops-row__title">{user.name || "Unknown player"}</div>
                          <div className="admin-ops-row__meta">
                            {user.email || "No email"} {user.mobile ? `• ${user.mobile}` : ""}
                          </div>
                        </div>
                      </div>

                      <div className="admin-ops-chip-group">
                        <span className="admin-ops-chip admin-ops-chip--success">{tier}</span>
                        {user.gamer_tag ? <span className="admin-ops-chip">@{user.gamer_tag}</span> : null}
                        <span className="admin-ops-chip admin-ops-chip--info">
                          {user.favorite_game || "No favorite game"}
                        </span>
                      </div>
                    </div>

                    <div className="admin-ops-row__block">
                      <div className="admin-ops-row__label">Commercial snapshot</div>
                      <div className="admin-ops-row__metrics">
                        <Metric label="Loyalty" value={`${user.loyalty_points || 0} pts`} />
                        <Metric label="Spend" value={formatCurrency(user.lifetime_spend)} />
                        <Metric label="Bookings" value={`${user.total_bookings || 0}`} />
                        <Metric label="Bills" value={`${user.settled_bills || 0}`} />
                      </div>
                    </div>

                    <div className="admin-ops-row__block">
                      <div className="admin-ops-row__label">Tournament profile</div>
                      <div className="admin-ops-row__value">
                        {user.tournament_rank ? `Rank #${user.tournament_rank}` : "Not ranked yet"}
                      </div>
                      <div className="admin-ops-row__hint">
                        Entries {user.tournament_entries || 0} • Win rate {winRate}% • Titles{" "}
                        {user.tournament_championships || 0}
                      </div>
                      <div className="admin-ops-row__hint">
                        Last visit {formatDateTime(user.last_visit)}
                      </div>
                    </div>

                    <div className="admin-ops-actions">
                      {canManageLoyalty ? (
                        <button
                          type="button"
                          className="admin-action-button"
                          style={primaryButton}
                          onClick={() => updatePoints(user.uid, user.loyalty_points)}
                        >
                          Edit loyalty
                        </button>
                      ) : (
                        <div className="admin-ops-note">Loyalty edits are limited to super admins.</div>
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
            label="players"
            onPageChange={setCurrentPage}
          />
        </>
      )}
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

function OpsSummaryStat({ label, value, meta, tone }) {
  return (
    <div className={`admin-ops-summary__item admin-ops-summary__item--${tone}`}>
      <div className="admin-ops-summary__label">{label}</div>
      <div className="admin-ops-summary__value">{value}</div>
      <div className="admin-ops-summary__meta">{meta}</div>
    </div>
  );
}

export default PlayersHub;

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

const primaryButton = {
  borderRadius: 16,
  border: "1px solid color-mix(in srgb, var(--secondary) 28%, var(--border))",
  background: "linear-gradient(135deg, var(--primary), var(--secondary))",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
  padding: "12px 16px",
};
