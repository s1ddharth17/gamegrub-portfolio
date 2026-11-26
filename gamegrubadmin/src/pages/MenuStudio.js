import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

import AdminPageHero from "../components/AdminPageHero";
import Pagination from "../components/Pagination";
import { MENU_CATEGORIES } from "../constants/menuCategories";
import usePagination from "../hooks/usePagination";
import AdminLayout from "../layout/AdminLayout";
import { API_BASE_URL, resolveUploadUrl } from "../config/api";
import { useAdminBusiness, withBusinessParams } from "../context/AdminBusinessContext";

const ITEMS_PER_PAGE = 6;
const DEFAULT_FORM = {
  name: "",
  amount: "",
  category: MENU_CATEGORIES[0],
  description: "",
  prep_time_minutes: "10",
  is_available: true,
  is_featured: false,
};

function formatCurrency(value) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function normalizeCategory(category) {
  const value = String(category || "").trim();

  if (!value) {
    return MENU_CATEGORIES[0];
  }

  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function MenuStudio() {
  const { selectedBusiness, selectedBusinessId, loading: businessLoading } = useAdminBusiness();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [image, setImage] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState(DEFAULT_FORM);
  const [editImage, setEditImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [error, setError] = useState("");

  const loadMenu = useCallback(async () => {
    if (!selectedBusinessId) {
      setItems([]);
      setLoading(false);
      setError(businessLoading ? "" : "Select a cafe workspace to load its menu.");
      return;
    }

    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE_URL}/menu/all`, {
        params: withBusinessParams(selectedBusinessId),
      });
      setItems(response.data);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to load menu items.");
    } finally {
      setLoading(false);
    }
  }, [businessLoading, selectedBusinessId]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  const categories = useMemo(() => {
    const options = new Map();

    [...MENU_CATEGORIES, ...items.map((item) => item.category)]
      .map(normalizeCategory)
      .forEach((category) => {
        options.set(category.toLowerCase(), category);
      });

    return Array.from(options.values());
  }, [items]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesCategory =
        activeCategory === "All" ||
        normalizeCategory(item.category).toLowerCase() === activeCategory.toLowerCase();

      const matchesSearch =
        !term ||
        [item.name, item.category, item.description].join(" ").toLowerCase().includes(term);

      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, items, search]);

  const {
    currentPage,
    endItem,
    pageItems,
    setCurrentPage,
    startItem,
    totalItems,
    totalPages,
  } = usePagination(filteredItems, ITEMS_PER_PAGE, [activeCategory, search, items.length]);

  const totals = useMemo(
    () => ({
      all: items.length,
      available: items.filter((item) => item.is_available).length,
      featured: items.filter((item) => item.is_featured).length,
      categories: categories.length,
    }),
    [categories.length, items]
  );

  const visibleLabel =
    filteredItems.length === 1 ? "1 item visible" : `${filteredItems.length} items visible`;
  const activeFilterLabel = activeCategory === "All" ? "All categories" : activeCategory;

  const handleFormChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleEditChange = (field, value) => {
    setEditForm((current) => ({ ...current, [field]: value }));
  };

  const addItem = async () => {
    if (!selectedBusinessId) {
      window.alert("Choose a cafe workspace before adding a menu item.");
      return;
    }

    if (!form.name || !form.amount) {
      window.alert("Enter the menu item name and price.");
      return;
    }

    const formData = new FormData();
    formData.append("business_id", String(selectedBusinessId));
    Object.entries({ ...form, category: normalizeCategory(form.category) }).forEach(([key, value]) => {
      formData.append(key, String(value));
    });

    if (image) {
      formData.append("image", image);
    }

    try {
      setSaving(true);
      await axios.post(`${API_BASE_URL}/menu/add`, formData);
      setForm(DEFAULT_FORM);
      setImage(null);
      await loadMenu();
    } catch (requestError) {
      window.alert(requestError.response?.data?.error || "Could not save the menu item.");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (item) => {
    setEditItem(item);
    setEditForm({
      name: item.name || "",
      amount: String(item.amount || ""),
      category: normalizeCategory(item.category),
      description: item.description || "",
      prep_time_minutes: String(item.prep_time_minutes || 10),
      is_available: Boolean(item.is_available),
      is_featured: Boolean(item.is_featured),
    });
    setEditImage(null);
  };

  const updateItem = async () => {
    if (!editItem) {
      return;
    }

    if (!selectedBusinessId) {
      window.alert("Choose a cafe workspace before updating a menu item.");
      return;
    }

    const formData = new FormData();
    formData.append("business_id", String(selectedBusinessId));
    Object.entries({ ...editForm, category: normalizeCategory(editForm.category) }).forEach(
      ([key, value]) => {
        formData.append(key, String(value));
      }
    );

    if (editImage) {
      formData.append("image", editImage);
    }

    try {
      setUpdating(true);
      await axios.put(`${API_BASE_URL}/menu/update/${editItem.id}`, formData);
      setEditItem(null);
      setEditImage(null);
      await loadMenu();
    } catch (requestError) {
      window.alert(requestError.response?.data?.error || "Could not update the menu item.");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <AdminLayout>
      <AdminPageHero
        eyebrow="Menu Studio"
        title="Menu"
        subtitle={
          selectedBusiness
            ? `Keep ${selectedBusiness.name}'s kitchen catalog lean, current, and easy to update without scrolling through repetitive food cards.`
            : "Keep the kitchen catalog lean, current, and easy to update without scrolling through repetitive food cards."
        }
        chips={[`${totals.featured} featured`, `${totals.available} live`, selectedBusiness?.name || visibleLabel]}
        badge={{
          title: "Catalog items",
          value: totals.all,
          meta: `${activeFilterLabel} | ${totals.categories} categories`,
          label: "Kitchen board",
        }}
        actions={
          <>
            <input
              className="admin-search"
              style={searchInput}
              placeholder="Search items, categories, or descriptions"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <select
              style={filterSelect}
              value={activeCategory}
              onChange={(event) => setActiveCategory(event.target.value)}
            >
              <option value="All">All Categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="admin-action-button rig-fleet__refresh-button"
              onClick={loadMenu}
              disabled={loading || !selectedBusinessId}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </>
        }
      />

      <div className="admin-ops-summary">
        <OpsSummaryStat label="Catalog items" value={totals.all} meta={visibleLabel} tone="warm" />
        <OpsSummaryStat label="Live items" value={totals.available} meta="Available to order" tone="success" />
        <OpsSummaryStat label="Featured" value={totals.featured} meta="Highlighted in the app" tone="warning" />
        <OpsSummaryStat label="Categories" value={totals.categories} meta={activeFilterLabel} tone="neutral" />
      </div>

      {error ? <div style={errorBanner}>{error}</div> : null}

      <div className="admin-studio-grid">
        <section className="admin-panel admin-studio-panel">
          <div style={editorHeader}>
            <div style={sectionTitle}>Add menu item</div>
            <div style={sectionCopy}>Create one clean entry for the cafe catalog and decide whether it is live or featured.</div>
          </div>

          <div className="admin-studio-form-grid">
            <label className="admin-studio-field">
              <span style={label}>Name</span>
              <input
                placeholder="Item name"
                value={form.name}
                onChange={(event) => handleFormChange("name", event.target.value)}
              />
            </label>
            <label className="admin-studio-field">
              <span style={label}>Price</span>
              <input
                placeholder="Price"
                type="number"
                min="0"
                value={form.amount}
                onChange={(event) => handleFormChange("amount", event.target.value)}
              />
            </label>
            <label className="admin-studio-field">
              <span style={label}>Category</span>
              <select
                value={form.category}
                onChange={(event) => handleFormChange("category", event.target.value)}
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-studio-field">
              <span style={label}>Prep time</span>
              <input
                placeholder="Prep time (mins)"
                type="number"
                min="1"
                value={form.prep_time_minutes}
                onChange={(event) => handleFormChange("prep_time_minutes", event.target.value)}
              />
            </label>

            <label className="admin-studio-field admin-studio-field--wide">
              <span style={label}>Description</span>
              <textarea
                placeholder="Description"
                value={form.description}
                onChange={(event) => handleFormChange("description", event.target.value)}
                rows={4}
              />
            </label>

            <label className="admin-file-field admin-studio-field admin-studio-field--wide">
              Upload image
              <input
                className="admin-hidden-input"
                type="file"
                onChange={(event) => setImage(event.target.files?.[0] || null)}
              />
              <span className="admin-file-value">{image?.name || "Choose file"}</span>
            </label>

            <div className="admin-toggle-group admin-studio-field admin-studio-field--wide">
              <label className="admin-toggle-row">
                <input
                  type="checkbox"
                  checked={form.is_available}
                  onChange={(event) => handleFormChange("is_available", event.target.checked)}
                />
                Available to order
              </label>
              <label className="admin-toggle-row">
                <input
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(event) => handleFormChange("is_featured", event.target.checked)}
                />
                Feature on customer app
              </label>
            </div>
          </div>

          <div className="admin-studio-preview">
            <div className="admin-studio-preview__badge" style={categoryBadge}>
              {normalizeCategory(form.category)}
            </div>
            <div style={itemTitle}>{form.name || "Menu item preview"}</div>
            <div style={itemDescription}>
              {form.description || "This is the short menu copy customers will scan before ordering."}
            </div>
            <div className="admin-ops-chip-group">
              <span className="admin-ops-chip admin-ops-chip--info">
                {form.amount ? formatCurrency(form.amount) : "Price pending"}
              </span>
              <span className="admin-ops-chip">
                {form.prep_time_minutes || "0"} min prep
              </span>
              {form.is_featured ? <span className="admin-ops-chip admin-ops-chip--warning">Featured</span> : null}
            </div>
          </div>

          <button
            type="button"
            className="admin-action-button"
            style={primaryButton}
            onClick={addItem}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save menu item"}
          </button>
        </section>

        {loading ? (
          <div className="admin-empty-state">Loading items...</div>
        ) : filteredItems.length === 0 ? (
          <div className="admin-empty-state">No items found.</div>
        ) : (
          <div>
            <section className="admin-panel-soft admin-ops-list-shell">
              <div className="admin-ops-list-shell__header">
                <div>
                  <div className="admin-ops-list-shell__eyebrow">Catalog</div>
                  <div className="admin-ops-list-shell__title">Menu items in view</div>
                </div>
                <div className="admin-ops-list-shell__meta">
                  Showing {startItem}-{endItem} of {totalItems}
                </div>
              </div>

              <div className="admin-ops-list">
                {pageItems.map((item) => (
                  <article key={item.id} className="admin-ops-row admin-surface-hover">
                    <div className="admin-ops-row__primary">
                      <div style={rowHeader}>
                        <div style={thumbWrap}>
                          {item.image ? (
                            <img src={resolveUploadUrl(item.image)} alt={item.name} style={thumbImage} />
                          ) : (
                            <div style={thumbFallback}>No image</div>
                          )}
                        </div>
                        <div>
                          <div className="admin-ops-row__eyebrow">{normalizeCategory(item.category)}</div>
                          <div className="admin-ops-row__title">{item.name}</div>
                          <div className="admin-ops-row__meta">
                            {item.description || "No description."}
                          </div>
                        </div>
                      </div>
                      <div className="admin-ops-chip-group">
                        {item.is_featured ? (
                          <span className="admin-ops-chip admin-ops-chip--warning">Featured</span>
                        ) : null}
                        <span className={`admin-ops-chip${item.is_available ? " admin-ops-chip--success" : ""}`}>
                          {item.is_available ? "Live" : "Paused"}
                        </span>
                      </div>
                    </div>

                    <div className="admin-ops-row__block">
                      <div className="admin-ops-row__label">Pricing</div>
                      <div className="admin-ops-row__value">{formatCurrency(item.amount)}</div>
                      <div className="admin-ops-row__hint">Customer-facing menu price</div>
                    </div>

                    <div className="admin-ops-row__block">
                      <div className="admin-ops-row__label">Kitchen prep</div>
                      <div className="admin-ops-row__value">{item.prep_time_minutes || 0} min</div>
                      <div className="admin-ops-row__hint">
                        {item.is_featured ? "Highlighted for discovery" : "Standard catalog item"}
                      </div>
                    </div>

                    <div className="admin-ops-actions">
                      <button
                        type="button"
                        className="admin-action-button"
                        style={secondaryButton}
                        onClick={() => openEdit(item)}
                      >
                        Edit
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              startItem={startItem}
              endItem={endItem}
              label="menu items"
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>

      {editItem ? (
        <div className="admin-modal-overlay">
          <div className="admin-modal-card">
            <div style={modalTitle}>Edit item</div>

            <div className="admin-form-grid">
              <input value={editForm.name} onChange={(event) => handleEditChange("name", event.target.value)} />
              <input
                type="number"
                min="0"
                value={editForm.amount}
                onChange={(event) => handleEditChange("amount", event.target.value)}
              />
              <select
                value={editForm.category}
                onChange={(event) => handleEditChange("category", event.target.value)}
              >
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={editForm.prep_time_minutes}
                onChange={(event) => handleEditChange("prep_time_minutes", event.target.value)}
              />
              <textarea
                className="admin-form-span-2"
                value={editForm.description}
                onChange={(event) => handleEditChange("description", event.target.value)}
              />
              <label className="admin-file-field">
                Image
                <input
                  className="admin-hidden-input"
                  type="file"
                  onChange={(event) => setEditImage(event.target.files?.[0] || null)}
                />
                <span className="admin-file-value">{editImage?.name || "Keep existing image"}</span>
              </label>

              <div className="admin-toggle-group">
                <label className="admin-toggle-row">
                  <input
                    type="checkbox"
                    checked={editForm.is_available}
                    onChange={(event) => handleEditChange("is_available", event.target.checked)}
                  />
                  Available to order
                </label>
                <label className="admin-toggle-row">
                  <input
                    type="checkbox"
                    checked={editForm.is_featured}
                    onChange={(event) => handleEditChange("is_featured", event.target.checked)}
                  />
                  Feature item
                </label>
              </div>
            </div>

            <div style={modalActions}>
              <button
                type="button"
                className="admin-action-button"
                style={secondaryButton}
                onClick={() => setEditItem(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-action-button"
                style={primaryButton}
                onClick={updateItem}
                disabled={updating}
              >
                {updating ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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

export default MenuStudio;

const searchInput = {
  flex: "1 1 280px",
};

const filterSelect = {
  flex: "0 0 220px",
};

const editorHeader = {
  display: "grid",
  gap: 8,
};

const sectionTitle = {
  color: "var(--text)",
  fontSize: 20,
  fontWeight: 700,
};

const sectionCopy = {
  color: "var(--text-secondary)",
  lineHeight: 1.6,
};

const label = {
  color: "var(--text-secondary)",
  fontSize: 13,
  fontWeight: 600,
};

const primaryButton = {
  marginTop: 6,
  padding: "14px 18px",
  borderRadius: 18,
  border: "1px solid color-mix(in srgb, var(--secondary) 28%, var(--border))",
  background: "linear-gradient(135deg, var(--primary), var(--secondary))",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButton = {
  padding: "14px 18px",
  borderRadius: 18,
  border: "1px solid var(--border)",
  background: "var(--surface-elevated)",
  color: "var(--text)",
  fontWeight: 700,
  cursor: "pointer",
};

const errorBanner = {
  marginBottom: 18,
  padding: 16,
  borderRadius: 18,
  background: "var(--tone-danger-bg)",
  border: "1px solid var(--tone-danger-border)",
  color: "var(--tone-danger-text)",
};

const categoryBadge = {
  background: "var(--tone-info-bg)",
  borderColor: "var(--tone-info-border)",
};

const itemTitle = {
  color: "var(--text)",
  fontSize: 20,
  fontWeight: 700,
  lineHeight: 1.15,
};

const itemDescription = {
  color: "var(--text-secondary)",
  fontSize: 13,
  lineHeight: 1.55,
};

const rowHeader = {
  display: "flex",
  gap: 14,
  alignItems: "flex-start",
};

const thumbWrap = {
  width: 72,
  height: 72,
  borderRadius: 18,
  overflow: "hidden",
  background: "var(--surface-elevated)",
  flexShrink: 0,
};

const thumbImage = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const thumbFallback = {
  width: "100%",
  height: "100%",
  display: "grid",
  placeItems: "center",
  color: "var(--text-secondary)",
  fontSize: 12,
  textAlign: "center",
  padding: 8,
};

const modalTitle = {
  color: "var(--text)",
  fontSize: 24,
  fontWeight: 800,
  marginBottom: 18,
};

const modalActions = {
  marginTop: 18,
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
};
