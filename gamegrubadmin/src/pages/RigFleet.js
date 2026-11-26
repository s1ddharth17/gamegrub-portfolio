import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

import Pagination from "../components/Pagination";
import usePagination from "../hooks/usePagination";
import AdminPageHero from "../components/AdminPageHero";
import AdminLayout from "../layout/AdminLayout";
import { PC_CATEGORIES, getPcCategoryLabel } from "../constants/pcCategories";

import { API_BASE_URL } from "../config/api";
import { useAdminBusiness, withBusinessParams } from "../context/AdminBusinessContext";
const ITEMS_PER_PAGE = 8;
const LIVE_SESSION_STATES = new Set([
  "running",
  "overtime",
  "awaiting_settlement",
  "reserved",
  "no_show_risk",
]);
const CATEGORY_FILTERS = [
  { value: "all", label: "All" },
  { value: "high_end_pc", label: "High-End PC" },
  { value: "esports_pc", label: "Esports PC" },
  { value: "console", label: "Console" },
];

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function getLiveStateMeta(pc) {
  const state = String(pc.state || "").toLowerCase();

  if (String(pc.status || "").toLowerCase() === "inactive" || state === "inactive") {
    return { label: "Disabled", tone: "danger" };
  }

  switch (state) {
    case "running":
      return { label: "In use", tone: "warning" };
    case "overtime":
      return { label: "Overtime", tone: "danger" };
    case "awaiting_settlement":
      return { label: "Awaiting bill", tone: "warning" };
    case "reserved":
      return { label: "Reserved", tone: "info" };
    case "no_show_risk":
      return { label: "Pending start", tone: "warning" };
    case "free":
    default:
      return { label: "Available", tone: "success" };
  }
}

function getCategoryMark(category) {
  switch (category) {
    case "high_end_pc":
      return "HE";
    case "console":
      return "CN";
    case "esports_pc":
    default:
      return "ES";
  }
}

function toneClass(tone) {
  switch (tone) {
    case "cool":
    case "success":
      return "success";
    case "warm":
      return "warm";
    case "danger":
      return "danger";
    case "info":
      return "info";
    case "warning":
      return "warning";
    default:
      return "neutral";
  }
}

function RigFleet() {
  const { selectedBusiness, selectedBusinessId, loading: businessLoading } = useAdminBusiness();
  const [pcs, setPcs] = useState([]);
  const [specs, setSpecs] = useState("");
  const [category, setCategory] = useState("esports_pc");
  const [price, setPrice] = useState("");
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editPc, setEditPc] = useState(null);
  const [editSpecs, setEditSpecs] = useState("");
  const [editCategory, setEditCategory] = useState("esports_pc");
  const [editPrice, setEditPrice] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [error, setError] = useState("");

  const loadPCs = useCallback(async () => {
    if (!selectedBusinessId) {
      setPcs([]);
      setLoading(false);
      setError(businessLoading ? "" : "Select a cafe workspace to view its stations.");
      return;
    }

    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/pc/live-status`, {
        params: withBusinessParams(selectedBusinessId),
      });
      setPcs(
        (response.data || []).map((pc) => ({
          ...pc,
          status: pc.status || pc.pc_status || "inactive",
        }))
      );
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to load the rig fleet.");
    } finally {
      setLoading(false);
    }
  }, [businessLoading, selectedBusinessId]);

  useEffect(() => {
    loadPCs();
  }, [loadPCs]);

  const filteredPcs = useMemo(() => {
    const term = search.trim().toLowerCase();

    return pcs.filter((pc) => {
      const matchesCategory = selectedCategory === "all" ? true : pc.category === selectedCategory;
      const matchesSearch = !term
        ? true
        : [pc.pc_id, pc.specs, pc.status, pc.category, pc.state, pc.user].join(" ")
            .toLowerCase()
            .includes(term);

      return matchesCategory && matchesSearch;
    });
  }, [pcs, search, selectedCategory]);

  const {
    currentPage,
    endItem,
    pageItems,
    setCurrentPage,
    startItem,
    totalItems,
    totalPages,
  } = usePagination(filteredPcs, ITEMS_PER_PAGE, [pcs.length, search, selectedCategory]);

  const stats = useMemo(() => {
    const active = pcs.filter((pc) => pc.status === "active").length;
    const inactive = pcs.length - active;
    const averageRate =
      pcs.length === 0
        ? 0
        : pcs.reduce((sum, pc) => sum + Number(pc.price_per_hour || 0), 0) / pcs.length;
    const available = pcs.filter((pc) => getLiveStateMeta(pc).tone === "success").length;
    const busy = pcs.filter(
      (pc) =>
        pc.status === "active" && LIVE_SESSION_STATES.has(String(pc.state || "").toLowerCase())
    ).length;
    const consoles = pcs.filter((pc) => pc.category === "console").length;
    const popularCategory = [...PC_CATEGORIES]
      .map((option) => ({
        label: option.label,
        count: pcs.filter((pc) => pc.category === option.value).length,
      }))
      .sort((left, right) => right.count - left.count)[0];

    return {
      active,
      averageRate,
      available,
      busy,
      consoles,
      inactive,
      popularCategory: popularCategory?.count ? popularCategory.label : "No stations yet",
      popularCategoryCount: popularCategory?.count || 0,
      total: pcs.length,
    };
  }, [pcs]);

  const visibleLabel =
    filteredPcs.length === 1 ? "1 station visible" : `${filteredPcs.length} stations visible`;

  const addPC = async () => {
    if (!selectedBusinessId) {
      window.alert("Choose a cafe workspace before adding a station.");
      return;
    }

    if (!specs || !price) {
      window.alert("Enter the station specs and price per hour.");
      return;
    }

    try {
      setSaving(true);
      await axios.post(`${API_BASE_URL}/pc/add`, {
        business_id: selectedBusinessId,
        specs,
        category,
        price_per_hour: price,
        status: "active",
      });
      setSpecs("");
      setCategory("esports_pc");
      setPrice("");
      await loadPCs();
    } catch (requestError) {
      window.alert(requestError.response?.data?.error || "Could not add the station.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (pc) => {
    if (!selectedBusinessId) {
      window.alert("Choose a cafe workspace before updating a station.");
      return;
    }

    const nextStatus = pc.status === "active" ? "inactive" : "active";

    try {
      setUpdatingId(pc.pc_id);
      await axios.put(`${API_BASE_URL}/pc/update/${pc.pc_id}`, {
        business_id: selectedBusinessId,
        specs: pc.specs,
        category: pc.category,
        price_per_hour: pc.price_per_hour,
        status: nextStatus,
      });
      await loadPCs();
    } catch (requestError) {
      window.alert(requestError.response?.data?.error || "Could not update the rig status.");
    } finally {
      setUpdatingId(null);
    }
  };

  const openEdit = (pc) => {
    setEditPc(pc);
    setEditSpecs(pc.specs || "");
    setEditCategory(pc.category || "esports_pc");
    setEditPrice(String(pc.price_per_hour || ""));
  };

  const updatePc = async () => {
    if (!editPc) return;
    if (!selectedBusinessId) {
      window.alert("Choose a cafe workspace before updating a station.");
      return;
    }

    try {
      setUpdatingId(editPc.pc_id);
      await axios.put(`${API_BASE_URL}/pc/update/${editPc.pc_id}`, {
        business_id: selectedBusinessId,
        specs: editSpecs,
        category: editCategory,
        price_per_hour: editPrice,
        status: editPc.status,
      });
      setEditPc(null);
      await loadPCs();
    } catch (requestError) {
      window.alert(requestError.response?.data?.error || "Could not update the station.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <AdminLayout>
      <AdminPageHero
        title="Stations"
        subtitle={
          selectedBusiness
            ? `Manage pricing, availability, and live usage for ${selectedBusiness.name}.`
            : "Manage pricing, availability, and live usage across the floor."
        }
        chips={[selectedBusiness?.name || "Cafe workspace pending", visibleLabel]}
        badge={{
          title: "Available",
          value: stats.available,
          meta: visibleLabel,
        }}
        actions={
          <>
            <input
              className="admin-search rig-fleet__search"
              placeholder="Search station, specs, category or status"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <button
              type="button"
              className="admin-action-button rig-fleet__refresh-button"
              onClick={loadPCs}
              disabled={loading || !selectedBusinessId}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </>
        }
      />

      <section className="admin-panel-soft rig-fleet__toolbar">
        <div className="rig-fleet__filter-row">
          {CATEGORY_FILTERS.map((option) => {
            const active = selectedCategory === option.value;

            return (
              <button
                key={option.value}
                type="button"
                className={`admin-chip-button rig-fleet__filter-chip${active ? " is-active" : ""}`}
                onClick={() => setSelectedCategory(option.value)}
              >
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rig-fleet__stats">
        <StatCard
          icon="TT"
          label="Total stations"
          value={stats.total}
          hint={`${filteredPcs.length} currently on screen`}
          tone="warm"
        />
        <StatCard
          icon="ON"
          label="Active"
          value={stats.active}
          hint={`${stats.busy} of them are in play`}
          tone="cool"
        />
        <StatCard
          icon="OFF"
          label="Inactive"
          value={stats.inactive}
          hint={`${stats.consoles} console stations in the fleet`}
          tone="danger"
        />
        <StatCard
          icon="HR"
          label="Avg hourly rate"
          value={formatCurrency(stats.averageRate)}
          hint={`${stats.available} stations are walk-in ready`}
          tone="neutral"
        />
      </section>

      <section className="rig-fleet__control-grid">
        <div className="admin-panel admin-surface-hover">
          <div className="rig-fleet__section-title">Add station</div>

          <div className="admin-form-grid rig-fleet__form-grid">
            <input
              placeholder="Specs (Example: i7, RTX 4060, 16 GB RAM)"
              value={specs}
              onChange={(event) => setSpecs(event.target.value)}
            />

            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {PC_CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <input
              type="number"
              min="0"
              placeholder="Price per hour"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />

            <button
              type="button"
              className="admin-action-button rig-fleet__primary-button"
              onClick={addPC}
              disabled={saving}
            >
              {saving ? "Adding..." : "Add station"}
            </button>
          </div>
        </div>
      </section>

      {error ? <div className="rig-fleet__error">{error}</div> : null}

      {loading ? (
        <div className="admin-empty-state">Loading stations...</div>
      ) : filteredPcs.length === 0 ? (
        <div className="admin-empty-state">No stations match this view.</div>
      ) : (
        <>
          <section className="rig-fleet__section-header">
            <div className="rig-fleet__section-title">Live station deck</div>
            <div className="rig-fleet__section-pill">{visibleLabel}</div>
          </section>

          <div className="rig-fleet__grid">
            {pageItems.map((pc) => {
              const active = pc.status === "active";
              const stationLabel = pc.category === "console" ? "Console" : "PC";
              const liveState = getLiveStateMeta(pc);
              const categoryLabel = getPcCategoryLabel(pc.category);
              const categoryMark = getCategoryMark(pc.category);

              return (
                <article
                  key={pc.pc_id}
                  className={`admin-rig-card rig-fleet__card${active ? " is-active" : " is-inactive"}`}
                >
                  <div className="rig-fleet__card-header">
                    <div className="rig-fleet__card-identity">
                      <div className="rig-fleet__card-icon">{categoryMark}</div>
                      <div className="rig-fleet__card-identity-copy">
                        <div className="rig-fleet__card-title">
                          {stationLabel} {pc.pc_id}
                        </div>
                        <div className="rig-fleet__card-subtitle">{categoryLabel}</div>
                      </div>
                    </div>

                    <div className={`rig-fleet__rate-pill${active ? " is-active" : " is-inactive"}`}>
                      {formatCurrency(pc.price_per_hour)} / hr
                    </div>
                  </div>

                  <div className="rig-fleet__pill-row">
                    <div className={`rig-fleet__pill rig-fleet__pill--status${active ? " is-active" : " is-inactive"}`}>
                      {active ? "Active" : "Inactive"}
                    </div>
                    <div className={`rig-fleet__pill rig-fleet__pill--${toneClass(liveState.tone)}`}>
                      {liveState.label}
                    </div>
                  </div>

                  <div className="rig-fleet__spec-card">
                    <div className="rig-fleet__meta-label">Specs</div>
                    <div className="rig-fleet__specs">{pc.specs || "Specs pending"}</div>
                  </div>

                  <div className="rig-fleet__meta-grid">
                    <div className="rig-fleet__meta-tile">
                      <div className="rig-fleet__meta-label">Station type</div>
                      <div className="rig-fleet__meta-value">{categoryLabel}</div>
                    </div>

                    <div className="rig-fleet__meta-tile">
                      <div className="rig-fleet__meta-label">Player</div>
                      <div className="rig-fleet__meta-value">
                        {pc.user ? pc.user : active ? "Walk-in ready" : "Unavailable"}
                      </div>
                    </div>
                  </div>

                  <div className="rig-fleet__actions">
                    <button
                      type="button"
                      className={`admin-action-button rig-fleet__secondary-button${active ? " is-danger" : " is-success"}`}
                      onClick={() => toggleStatus(pc)}
                      disabled={updatingId === pc.pc_id}
                    >
                      {updatingId === pc.pc_id ? "Saving..." : active ? "Disable" : "Enable"}
                    </button>

                    <button
                      type="button"
                      className="admin-action-button rig-fleet__primary-button"
                      onClick={() => openEdit(pc)}
                    >
                      Edit
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            startItem={startItem}
            endItem={endItem}
            label="rigs"
            onPageChange={setCurrentPage}
          />
        </>
      )}

      {editPc ? (
        <div className="admin-modal-overlay">
          <div className="admin-modal-card">
            <div className="rig-fleet__modal-title">Edit station #{editPc.pc_id}</div>

            <div className="admin-form-grid">
              <input value={editSpecs} onChange={(event) => setEditSpecs(event.target.value)} />
              <select value={editCategory} onChange={(event) => setEditCategory(event.target.value)}>
                {PC_CATEGORIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                value={editPrice}
                onChange={(event) => setEditPrice(event.target.value)}
              />
            </div>

            <div className="rig-fleet__modal-actions">
              <button
                type="button"
                className="admin-action-button rig-fleet__ghost-button"
                onClick={() => setEditPc(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-action-button rig-fleet__primary-button"
                onClick={updatePc}
                disabled={updatingId === editPc.pc_id}
              >
                {updatingId === editPc.pc_id ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  );
}

function StatCard({ icon, label, value, hint, tone }) {
  return (
    <article className={`admin-stat-card admin-surface-hover rig-fleet__stat-card rig-fleet__stat-card--${toneClass(tone)}`}>
      <div className="rig-fleet__stat-top">
        <div className={`rig-fleet__stat-icon rig-fleet__stat-icon--${toneClass(tone)}`}>{icon}</div>
        <div className="rig-fleet__stat-hint">{hint}</div>
      </div>
      <div className="rig-fleet__stat-label">{label}</div>
      <div className="rig-fleet__stat-value">{value}</div>
    </article>
  );
}

export default RigFleet;
