import { useEffect, useMemo, useState } from "react";
import axios from "axios";

import AdminLayout from "../layout/AdminLayout";
import AdminPageHero from "../components/AdminPageHero";
import { API_BASE_URL } from "../config/api";

const EMPTY_FORM = {
  title: "",
  subtitle: "",
  summary: "",
  body: "",
  badge_label: "",
  cta_label: "Open event",
  linked_tournament_id: "",
  content_type: "spotlight",
  accent_tone: "orange",
  priority: "0",
  starts_at: "",
  ends_at: "",
  status: "draft",
};

const CONTENT_TYPE_OPTIONS = [
  { value: "spotlight", label: "Spotlight" },
  { value: "promo", label: "Promo" },
  { value: "community_update", label: "Community update" },
  { value: "recap", label: "Recap" },
];

const TONE_OPTIONS = [
  { value: "orange", label: "Orange" },
  { value: "turquoise", label: "Turquoise" },
  { value: "gold", label: "Gold" },
  { value: "rose", label: "Rose" },
];

function formatDateTime(value) {
  if (!value) {
    return "Not scheduled";
  }

  return new Date(String(value).replace(" ", "T")).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDateTimeInput(value) {
  if (!value) {
    return "";
  }

  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (input) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTypeLabel(value) {
  switch (String(value || "").trim().toLowerCase()) {
    case "community_update":
      return "Community update";
    default:
      return String(value || "spotlight")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (match) => match.toUpperCase());
  }
}

function formatStatusLabel(value) {
  return String(value || "draft")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function tonePreviewStyle(tone) {
  switch (tone) {
    case "turquoise":
      return {
        background:
          "linear-gradient(135deg, color-mix(in srgb, #32c2c6 18%, var(--surface)), var(--surface-elevated))",
        borderColor: "color-mix(in srgb, #32c2c6 30%, var(--border))",
      };
    case "gold":
      return {
        background:
          "linear-gradient(135deg, color-mix(in srgb, #f5af4a 18%, var(--surface)), var(--surface-elevated))",
        borderColor: "color-mix(in srgb, #f5af4a 30%, var(--border))",
      };
    case "rose":
      return {
        background:
          "linear-gradient(135deg, color-mix(in srgb, #ec4899 18%, var(--surface)), var(--surface-elevated))",
        borderColor: "color-mix(in srgb, #ec4899 30%, var(--border))",
      };
    default:
      return {
        background:
          "linear-gradient(135deg, color-mix(in srgb, #ff7b54 18%, var(--surface)), var(--surface-elevated))",
        borderColor: "color-mix(in srgb, #ff7b54 30%, var(--border))",
      };
  }
}

function CommunityPulseStudio() {
  const [posts, setPosts] = useState([]);
  const [reports, setReports] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadPage = async ({ resetBanners = false } = {}) => {
    try {
      setLoading(true);
      if (resetBanners) {
        setError("");
        setNotice("");
      }

      const [postsResponse, tournamentsResponse, reportsResponse] = await Promise.all([
        axios.get(`${API_BASE_URL}/tournament/admin/community`),
        axios.get(`${API_BASE_URL}/tournament/admin/all`),
        axios.get(`${API_BASE_URL}/tournament/admin/community/reports?status=pending`),
      ]);

      setPosts(Array.isArray(postsResponse.data?.posts) ? postsResponse.data.posts : []);
      setTournaments(Array.isArray(tournamentsResponse.data) ? tournamentsResponse.data : []);
      setReports(Array.isArray(reportsResponse.data?.reports) ? reportsResponse.data.reports : []);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to load community posts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage();
  }, []);

  const visiblePosts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return posts.filter((post) => {
      const matchesStatus = statusFilter === "all" || post.status === statusFilter;
      if (!matchesStatus) {
        return false;
      }

      if (!term) {
        return true;
      }

      return [
        post.title,
        post.subtitle,
        post.summary,
        post.badge_label,
        post.status,
        post.content_type,
        post.linked_tournament?.title,
        post.linked_tournament?.game_title,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [posts, search, statusFilter]);

  const totals = useMemo(() => {
    const published = posts.filter((post) => post.status === "published").length;
    const drafts = posts.filter((post) => post.status === "draft").length;
    const live = posts.filter((post) => post.is_active_now).length;
    const linked = posts.filter((post) => Number(post.linked_tournament_id || 0) > 0).length;

    return {
      total: posts.length,
      published,
      drafts,
      live,
      linked,
    };
  }, [posts]);

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
    setNotice("");
  };

  const startEditing = (post) => {
    setEditingId(post.post_id);
    setForm({
      title: post.title || "",
      subtitle: post.subtitle || "",
      summary: post.summary || "",
      body: post.body || "",
      badge_label: post.badge_label || "",
      cta_label: post.cta_label || "Open event",
      linked_tournament_id: post.linked_tournament_id ? String(post.linked_tournament_id) : "",
      content_type: post.content_type || "spotlight",
      accent_tone: post.accent_tone || "orange",
      priority: String(post.priority ?? 0),
      starts_at: formatDateTimeInput(post.starts_at),
      ends_at: formatDateTimeInput(post.ends_at),
      status: post.status || "draft",
    });
    setError("");
    setNotice("");
  };

  const handleFieldChange = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const buildPayload = () => ({
    title: form.title,
    subtitle: form.subtitle,
    summary: form.summary,
    body: form.body,
    badge_label: form.badge_label,
    cta_label: form.cta_label,
    linked_tournament_id: form.linked_tournament_id ? Number(form.linked_tournament_id) : null,
    content_type: form.content_type,
    accent_tone: form.accent_tone,
    priority: Number(form.priority || 0),
    starts_at: form.starts_at || null,
    ends_at: form.ends_at || null,
    status: form.status || "draft",
  });

  const persistPost = async () => {
    try {
      setSaving(true);
      setError("");
      setNotice("");

      const payload = buildPayload();
      const response = editingId
        ? await axios.put(`${API_BASE_URL}/tournament/admin/community/${editingId}`, payload)
        : await axios.post(`${API_BASE_URL}/tournament/admin/community`, payload);

      setNotice(response.data?.message || "Community post saved.");
      await loadPage();

      if (response.data?.post) {
        startEditing(response.data.post);
      } else {
        resetForm();
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to save that community post.");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (post, action) => {
    const actionLabel = action === "publish" ? "publish" : "archive";
    const confirmed = window.confirm(`Do you want to ${actionLabel} "${post.title}"?`);

    if (!confirmed) {
      return;
    }

    try {
      setError("");
      setNotice("");
      const response = await axios.post(
        `${API_BASE_URL}/tournament/admin/community/${post.post_id}/${action}`
      );
      setNotice(response.data?.message || "Community post updated.");
      await loadPage();

      if (editingId === post.post_id && response.data?.post) {
        startEditing(response.data.post);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to update post status.");
    }
  };

  const reviewReport = async (report, action) => {
    const actionLabel = action === "remove" ? "archive the reported post" : "dismiss this report";
    if (!window.confirm(`Do you want to ${actionLabel}?`)) return;
    const moderationNote = window.prompt("Optional moderation note:") || "";
    try {
      setError("");
      setNotice("");
      const response = await axios.post(
        `${API_BASE_URL}/tournament/admin/community/reports/${report.report_id}/review`,
        { action, moderation_note: moderationNote },
      );
      setNotice(response.data?.message || "Report reviewed.");
      await loadPage();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Unable to review report.");
    }
  };

  return (
    <AdminLayout>
      <AdminPageHero
        eyebrow="Community Pulse"
        title="Community content"
        subtitle="Compose spotlight cards and keep the player-facing feed clean, current, and easy to scan."
        chips={[`${totals.live} live`, `${totals.published} published`, `${visiblePosts.length} visible`]}
        badge={{
          title: "Linked events",
          value: totals.linked,
          meta: `${totals.total} total posts`,
          label: "Content studio",
        }}
        actions={
          <>
            <input
              className="admin-search"
              style={searchInput}
              placeholder="Search by title, type, or linked event"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select
              style={selectInput}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="published">Published</option>
              <option value="draft">Drafts</option>
              <option value="archived">Archived</option>
            </select>
            <button
              type="button"
              className="admin-action-button"
              onClick={() => loadPage({ resetBanners: true })}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button type="button" className="admin-action-button" onClick={resetForm}>
              New draft
            </button>
          </>
        }
      />

      <div className="admin-ops-summary">
        <OpsSummaryStat label="Live now" value={totals.live} meta="Visible in the app" tone="warm" />
        <OpsSummaryStat label="Published" value={totals.published} meta="Ready to promote" tone="success" />
        <OpsSummaryStat label="Drafts" value={totals.drafts} meta="Waiting for approval" tone="warning" />
        <OpsSummaryStat label="Linked events" value={totals.linked} meta="Connected to tournaments" tone="neutral" />
      </div>

      {error ? <div style={errorBanner}>{error}</div> : null}
      {notice ? <div style={successBanner}>{notice}</div> : null}

      <section className="admin-panel-soft admin-ops-list-shell" style={{ marginBottom: 18 }}>
        <div className="admin-ops-list-shell__header">
          <div>
            <div className="admin-ops-list-shell__eyebrow">Moderation</div>
            <div className="admin-ops-list-shell__title">Community reports</div>
          </div>
          <div className="admin-ops-list-shell__meta">{reports.length} pending</div>
        </div>
        {reports.length === 0 ? (
          <div className="admin-empty-state">No pending community reports.</div>
        ) : (
          <div className="admin-ops-list">
            {reports.map((report) => (
              <article key={report.report_id} className="admin-ops-row admin-surface-hover">
                <div className="admin-ops-row__primary">
                  <div className="admin-ops-row__eyebrow">
                    {String(report.reason || "other").toUpperCase()} • Report #{report.report_id}
                  </div>
                  <div className="admin-ops-row__title">{report.post_title || "Community post"}</div>
                  <div className="admin-ops-row__meta">{report.details || report.post_summary || "No additional details provided."}</div>
                  <div className="admin-ops-row__hint">Reported by {report.reporter_name || `player ${report.user_id}`}</div>
                </div>
                <div className="admin-ops-row__block">
                  <div className="admin-ops-row__label">Post status</div>
                  <div className="admin-ops-row__value">{formatStatusLabel(report.post_status)}</div>
                  <div className="admin-ops-row__hint">Submitted {formatDateTime(report.created_at)}</div>
                </div>
                <div className="admin-ops-actions">
                  <button type="button" className="admin-action-button" onClick={() => reviewReport(report, "dismiss")}>
                    Dismiss
                  </button>
                  <button type="button" className="admin-action-button" style={ghostButton} onClick={() => reviewReport(report, "remove")}>
                    Archive post
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="admin-studio-grid">
        <section className="admin-panel admin-studio-panel">
          <div style={panelHeader}>
            <div>
              <h2 style={panelTitle}>{editingId ? "Edit content post" : "Create content post"}</h2>
              <p style={panelCopy}>
                Write the one clear message players should see first, then link it to a tournament if needed.
              </p>
            </div>
          </div>

          <div className="admin-studio-form-grid">
            <label className="admin-studio-field">
              <span style={label}>Title</span>
              <input
                style={textInput}
                value={form.title}
                onChange={(event) => handleFieldChange("title", event.target.value)}
                placeholder="Friday Night Fighter spotlight"
              />
            </label>

            <label className="admin-studio-field">
              <span style={label}>Subtitle</span>
              <input
                style={textInput}
                value={form.subtitle}
                onChange={(event) => handleFieldChange("subtitle", event.target.value)}
                placeholder="Short secondary line"
              />
            </label>

            <label className="admin-studio-field admin-studio-field--wide">
              <span style={label}>Summary</span>
              <textarea
                style={textArea}
                rows={3}
                value={form.summary}
                onChange={(event) => handleFieldChange("summary", event.target.value)}
                placeholder="Tell players what matters in one strong paragraph."
              />
            </label>

            <label className="admin-studio-field admin-studio-field--wide">
              <span style={label}>Body</span>
              <textarea
                style={{ ...textArea, minHeight: 130 }}
                rows={6}
                value={form.body}
                onChange={(event) => handleFieldChange("body", event.target.value)}
                placeholder="Optional longer detail for the drawer."
              />
            </label>

            <label className="admin-studio-field">
              <span style={label}>Type</span>
              <select
                style={selectInput}
                value={form.content_type}
                onChange={(event) => handleFieldChange("content_type", event.target.value)}
              >
                {CONTENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-studio-field">
              <span style={label}>Tone</span>
              <select
                style={selectInput}
                value={form.accent_tone}
                onChange={(event) => handleFieldChange("accent_tone", event.target.value)}
              >
                {TONE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-studio-field">
              <span style={label}>Badge label</span>
              <input
                style={textInput}
                value={form.badge_label}
                onChange={(event) => handleFieldChange("badge_label", event.target.value)}
                placeholder="Weekend highlight"
              />
            </label>

            <label className="admin-studio-field">
              <span style={label}>CTA label</span>
              <input
                style={textInput}
                value={form.cta_label}
                onChange={(event) => handleFieldChange("cta_label", event.target.value)}
                placeholder="Open event"
              />
            </label>

            <label className="admin-studio-field">
              <span style={label}>Linked tournament</span>
              <select
                style={selectInput}
                value={form.linked_tournament_id}
                onChange={(event) => handleFieldChange("linked_tournament_id", event.target.value)}
              >
                <option value="">No linked event</option>
                {tournaments.map((tournament) => (
                  <option key={tournament.tournament_id} value={tournament.tournament_id}>
                    {tournament.title} ({tournament.game_title || "Tournament"})
                  </option>
                ))}
              </select>
            </label>

            <label className="admin-studio-field">
              <span style={label}>Priority</span>
              <input
                style={textInput}
                type="number"
                min="0"
                max="999"
                value={form.priority}
                onChange={(event) => handleFieldChange("priority", event.target.value)}
              />
            </label>

            <label className="admin-studio-field">
              <span style={label}>Starts at</span>
              <input
                style={textInput}
                type="datetime-local"
                value={form.starts_at}
                onChange={(event) => handleFieldChange("starts_at", event.target.value)}
              />
            </label>

            <label className="admin-studio-field">
              <span style={label}>Ends at</span>
              <input
                style={textInput}
                type="datetime-local"
                value={form.ends_at}
                onChange={(event) => handleFieldChange("ends_at", event.target.value)}
              />
            </label>

            <label className="admin-studio-field">
              <span style={label}>Status</span>
              <select
                style={selectInput}
                value={form.status}
                onChange={(event) => handleFieldChange("status", event.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>

          <div className="admin-studio-preview">
            <div className="admin-studio-preview__badge" style={tonePreviewStyle(form.accent_tone)}>
              {form.badge_label || formatTypeLabel(form.content_type)}
            </div>
            <div style={previewTitle}>{form.title || "Community post preview"}</div>
            <div style={previewSummary}>
              {form.summary || "This is where the short player-facing hook appears in the tournament feed."}
            </div>
          </div>

          <div style={buttonRow}>
            <button type="button" className="admin-action-button" onClick={persistPost} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save changes" : "Create draft"}
            </button>
            <button type="button" className="admin-action-button" onClick={resetForm}>
              Reset
            </button>
          </div>
        </section>

        <section className="admin-panel-soft admin-ops-list-shell">
          <div className="admin-ops-list-shell__header">
            <div>
              <div className="admin-ops-list-shell__eyebrow">Feed</div>
              <div className="admin-ops-list-shell__title">Community posts in view</div>
            </div>
            <div className="admin-ops-list-shell__meta">
              {visiblePosts.length} visible of {posts.length}
            </div>
          </div>

          {loading ? (
            <div className="admin-empty-state">Loading community posts...</div>
          ) : visiblePosts.length === 0 ? (
            <div className="admin-empty-state">No community posts match the current filter.</div>
          ) : (
            <div className="admin-ops-list">
              {visiblePosts.map((post) => (
                <article
                  key={post.post_id}
                  className={`admin-ops-row admin-surface-hover${
                    editingId === post.post_id ? " admin-ops-row--attention" : ""
                  }`}
                >
                  <div className="admin-ops-row__primary">
                    <div className="admin-ops-row__eyebrow">
                      {formatTypeLabel(post.content_type)} • Priority {post.priority}
                    </div>
                    <div className="admin-ops-row__title">{post.title}</div>
                    <div className="admin-ops-row__meta">
                      {post.subtitle || post.summary || "No summary added yet."}
                    </div>
                    <div className="admin-ops-chip-group">
                      <span style={statusPill(post.status)}>{formatStatusLabel(post.status)}</span>
                      <span className="admin-ops-chip">{post.badge_label || "No badge label"}</span>
                      {post.is_active_now ? (
                        <span className="admin-ops-chip admin-ops-chip--info">Live now</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="admin-ops-row__block">
                    <div className="admin-ops-row__label">Event link</div>
                    <div className="admin-ops-row__value">
                      {post.linked_tournament?.title || "No linked event"}
                    </div>
                    <div className="admin-ops-row__hint">
                      {post.linked_tournament?.game_title || "Standalone community post"}
                    </div>
                  </div>

                  <div className="admin-ops-row__block">
                    <div className="admin-ops-row__label">Schedule</div>
                    <div className="admin-ops-row__value">
                      {post.starts_at ? formatDateTime(post.starts_at) : "Always on when published"}
                    </div>
                    <div className="admin-ops-row__hint">
                      {post.ends_at ? `Ends ${formatDateTime(post.ends_at)}` : "No end date"}
                    </div>
                  </div>

                  <div className="admin-ops-actions">
                    <button type="button" className="admin-action-button" onClick={() => startEditing(post)}>
                      Edit
                    </button>
                    {post.status !== "published" ? (
                      <button
                        type="button"
                        className="admin-action-button"
                        style={successButton}
                        onClick={() => changeStatus(post, "publish")}
                      >
                        Publish
                      </button>
                    ) : null}
                    {post.status !== "archived" ? (
                      <button
                        type="button"
                        className="admin-action-button"
                        style={ghostButton}
                        onClick={() => changeStatus(post, "archive")}
                      >
                        Archive
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
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

export default CommunityPulseStudio;

const panelHeader = {
  display: "flex",
  alignItems: "start",
  justifyContent: "space-between",
  gap: 16,
};

const panelTitle = {
  margin: 0,
  color: "var(--text)",
  fontSize: 22,
  fontWeight: 700,
};

const panelCopy = {
  margin: "8px 0 0",
  color: "var(--text-secondary)",
  lineHeight: 1.6,
};

const label = {
  color: "var(--text-secondary)",
  fontSize: 13,
  fontWeight: 600,
};

const textInput = {
  borderRadius: 14,
  border: "1px solid var(--border)",
  background: "var(--surface-elevated)",
  color: "var(--text)",
  padding: "12px 14px",
  fontSize: 14,
  outline: "none",
};

const textArea = {
  ...textInput,
  resize: "vertical",
};

const selectInput = {
  ...textInput,
  appearance: "none",
};

const searchInput = {
  ...textInput,
  minWidth: 240,
};

const previewTitle = {
  color: "var(--text)",
  fontSize: 20,
  fontWeight: 700,
};

const previewSummary = {
  color: "var(--text-secondary)",
  lineHeight: 1.6,
};

const buttonRow = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};

const errorBanner = {
  marginBottom: 18,
  borderRadius: 18,
  border: "1px solid var(--tone-danger-border)",
  background: "var(--tone-danger-bg)",
  color: "var(--tone-danger-text)",
  padding: "14px 16px",
};

const successBanner = {
  marginBottom: 18,
  borderRadius: 18,
  border: "1px solid var(--tone-success-border)",
  background: "var(--tone-success-bg)",
  color: "var(--tone-success-text)",
  padding: "14px 16px",
};

const successButton = {
  borderRadius: 16,
  border: "1px solid var(--tone-success-border)",
  background: "var(--tone-success-bg)",
  color: "var(--tone-success-text)",
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

function statusPill(status) {
  if (status === "published") {
    return {
      borderRadius: 999,
      padding: "6px 10px",
      background: "var(--tone-success-bg)",
      color: "var(--tone-success-text)",
      fontSize: 12,
      fontWeight: 600,
      border: "1px solid var(--tone-success-border)",
    };
  }

  if (status === "archived") {
    return {
      borderRadius: 999,
      padding: "6px 10px",
      background: "var(--tone-danger-bg)",
      color: "var(--tone-danger-text)",
      fontSize: 12,
      fontWeight: 600,
      border: "1px solid var(--tone-danger-border)",
    };
  }

  return {
    borderRadius: 999,
    padding: "6px 10px",
    background: "var(--tone-gold-bg)",
    color: "var(--tone-gold-text)",
    fontSize: 12,
    fontWeight: 600,
    border: "1px solid var(--tone-gold-border)",
  };
}
