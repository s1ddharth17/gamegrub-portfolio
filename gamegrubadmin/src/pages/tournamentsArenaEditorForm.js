import { sectionCopy, sectionHeader, sectionTitle } from "./tournamentsArenaStyles";

function AdminFormField({ label, hint, className = "", children }) {
  const fieldClassName = ["admin-form-field", className].filter(Boolean).join(" ");

  return (
    <label className={fieldClassName}>
      <span className="admin-form-field__label">{label}</span>
      {hint ? <span className="admin-form-field__hint">{hint}</span> : null}
      {children}
    </label>
  );
}

function TournamentsArenaEditorForm({
  editingId,
  form,
  saving,
  coverUploading,
  coverUploadError,
  coverPreviewUrl,
  onResetForm,
  onSubmit,
  onChange,
  onCoverUpload,
  onClearCover,
}) {
  return (
    <section className="admin-panel admin-surface-hover" style={{ marginBottom: 18 }}>
      <div style={sectionHeader}>
        <div>
          <div style={sectionTitle}>{editingId ? "Edit tournament" : "Create tournament"}</div>
          <div style={sectionCopy}>
            Registrations, roster review, bracket handoff, and live match operations now run from this workspace.
            Payment collection, sponsor placement, premium access, and refund policy settings live here too.
          </div>
        </div>
        {editingId ? (
          <button
            type="button"
            className="admin-action-button rig-fleet__ghost-button"
            onClick={onResetForm}
          >
            Clear edit
          </button>
        ) : null}
      </div>

      <form onSubmit={onSubmit} className="admin-form-grid">
        <AdminFormField
          label="Tournament title"
          hint="Public event name shown across discovery, registrations, and ops."
        >
          <input
            name="title"
            placeholder="Weekend Masters Open"
            value={form.title}
            onChange={onChange}
          />
        </AdminFormField>
        <AdminFormField label="Game title" hint="Main game this bracket is built for.">
          <input
            name="game_title"
            placeholder="Valorant"
            value={form.game_title}
            onChange={onChange}
          />
        </AdminFormField>
        <AdminFormField
          label="Skill level"
          hint="Helps players find events suited to their experience."
        >
          <select name="skill_level" value={form.skill_level} onChange={onChange}>
            <option value="open">Open to all</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </AdminFormField>
        <AdminFormField
          label="Slug (optional)"
          hint="Short URL id. Leave blank if you want to generate it later."
        >
          <input
            name="slug"
            placeholder="weekend-masters-open"
            value={form.slug}
            onChange={onChange}
          />
        </AdminFormField>

        <AdminFormField label="Format" hint="Choose whether players enter solo, duo, or as teams.">
          <select name="format" value={form.format} onChange={onChange}>
            <option value="solo">Solo</option>
            <option value="duo">Duo</option>
            <option value="squad">Squad</option>
            <option value="team">Team</option>
          </select>
        </AdminFormField>

        <AdminFormField label="Team size" hint="Players included in each entry.">
          <input
            name="team_size"
            type="number"
            min="1"
            placeholder="1"
            value={form.team_size}
            onChange={onChange}
          />
        </AdminFormField>
        <AdminFormField
          label="Max participants"
          hint="Total solo players or teams that can enter."
        >
          <input
            name="max_participants"
            type="number"
            min="2"
            placeholder="16"
            value={form.max_participants}
            onChange={onChange}
          />
        </AdminFormField>
        <AdminFormField
          label="Entry fee"
          hint="Standard registration amount in rupees."
        >
          <input
            name="entry_fee"
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
            value={form.entry_fee}
            onChange={onChange}
          />
        </AdminFormField>
        <AdminFormField
          label="Prize pool"
          hint="Guaranteed or planned payout total in rupees."
        >
          <input
            name="prize_pool"
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
            value={form.prize_pool}
            onChange={onChange}
          />
        </AdminFormField>
        <label className="admin-toggle-group">
          <span style={{ color: "var(--text)", fontWeight: 700 }}>Sponsored event</span>
          <span className="admin-toggle-row">
            <input
              type="checkbox"
              name="is_sponsored"
              checked={form.is_sponsored}
              onChange={onChange}
            />
            Highlight a sponsor and track sponsor-backed prize money
          </span>
        </label>
        <label className="admin-toggle-group">
          <span style={{ color: "var(--text)", fontWeight: 700 }}>Premium add-on</span>
          <span className="admin-toggle-row">
            <input
              type="checkbox"
              name="is_premium"
              checked={form.is_premium}
              onChange={onChange}
            />
            Offer a premium registration tier with extra perks
          </span>
        </label>
        {form.is_sponsored ? (
          <>
            <AdminFormField label="Sponsor name" hint="Brand or partner shown on the event.">
              <input
                name="sponsor_name"
                placeholder="HyperX"
                value={form.sponsor_name}
                onChange={onChange}
              />
            </AdminFormField>
            <AdminFormField
              label="Sponsor prize contribution"
              hint="Amount the sponsor is adding to the pool in rupees."
            >
              <input
                name="sponsor_prize_contribution"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={form.sponsor_prize_contribution}
                onChange={onChange}
              />
            </AdminFormField>
            <AdminFormField
              className="admin-form-span-2"
              label="Sponsor tagline"
              hint="Short promo line or sponsor callout shown with the event."
            >
              <input
                name="sponsor_tagline"
                placeholder="Powered by HyperX"
                value={form.sponsor_tagline}
                onChange={onChange}
              />
            </AdminFormField>
          </>
        ) : null}
        {form.is_premium ? (
          <>
            <AdminFormField
              label="Premium label"
              hint="Name shown to players for the upgraded registration tier."
            >
              <input
                name="premium_label"
                placeholder="VIP access"
                value={form.premium_label}
                onChange={onChange}
              />
            </AdminFormField>
            <AdminFormField
              label="Premium add-on fee"
              hint="Extra amount charged above the standard entry fee."
            >
              <input
                name="premium_entry_fee"
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={form.premium_entry_fee}
                onChange={onChange}
              />
            </AdminFormField>
            <AdminFormField
              className="admin-form-span-2"
              label="Premium perks"
              hint="Explain what the upgraded registration includes."
            >
              <textarea
                name="premium_perks"
                placeholder="Lounge access, merch, coaching, priority seating, or other premium benefits"
                value={form.premium_perks}
                onChange={onChange}
              />
            </AdminFormField>
          </>
        ) : null}
        <AdminFormField label="Refund policy" hint="Choose how cancellations are handled.">
          <select name="refund_policy" value={form.refund_policy} onChange={onChange}>
            <option value="no_refunds">No refunds</option>
            <option value="full_before_cutoff">Full refund before cutoff</option>
            <option value="partial_before_cutoff">Partial refund before cutoff</option>
          </select>
        </AdminFormField>
        <AdminFormField
          label="Refund cutoff (hours)"
          hint="Hours before the event when refunds stop."
        >
          <input
            name="refund_cutoff_hours"
            type="number"
            min="0"
            placeholder="24"
            value={form.refund_cutoff_hours}
            onChange={onChange}
          />
        </AdminFormField>
        <AdminFormField
          label="Refund percentage"
          hint="Used when the partial refund policy is selected."
        >
          <input
            name="refund_percentage"
            type="number"
            min="0"
            max="100"
            placeholder="100"
            value={form.refund_percentage}
            onChange={onChange}
          />
        </AdminFormField>
        <AdminFormField label="Venue or room" hint="Location shown to staff and players.">
          <input
            name="location_label"
            placeholder="GameGrub Arena"
            value={form.location_label}
            onChange={onChange}
          />
        </AdminFormField>

        <AdminFormField
          label="Publish status"
          hint="Draft stays internal until you are ready to publish."
        >
          <select name="status" value={form.status} onChange={onChange}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </AdminFormField>

        <div className="admin-form-span-2 admin-form-section">
          <div>
            <div className="admin-form-section__title">Schedule and registration windows</div>
            <div className="admin-form-section__copy">
              These dates control when players can join and when the tournament itself starts and ends.
            </div>
          </div>
          <div className="admin-form-subgrid">
            <AdminFormField
              label="Registration opens at"
              hint="First moment this event accepts new signups."
            >
              <input
                name="registration_open_at"
                type="datetime-local"
                value={form.registration_open_at}
                onChange={onChange}
              />
            </AdminFormField>
            <AdminFormField
              label="Registration closes at"
              hint="Last moment players can join before seeding locks."
            >
              <input
                name="registration_close_at"
                type="datetime-local"
                value={form.registration_close_at}
                onChange={onChange}
              />
            </AdminFormField>
            <AdminFormField
              label="Tournament starts at"
              hint="Check-in, briefing, or first match start time."
            >
              <input
                name="start_at"
                type="datetime-local"
                value={form.start_at}
                onChange={onChange}
              />
            </AdminFormField>
            <AdminFormField
              label="Tournament ends at"
              hint="Expected finals wrap-up or venue release time."
            >
              <input
                name="end_at"
                type="datetime-local"
                value={form.end_at}
                onChange={onChange}
              />
            </AdminFormField>
          </div>
        </div>

        <AdminFormField
          className="admin-form-span-2"
          label="Cover image URL (optional)"
          hint="Use a hosted URL or upload an image below. Inline base64 data is blocked because it breaks the user app."
        >
          <div style={{ display: "grid", gap: 12 }}>
            <input
              name="cover_image"
              placeholder="https://example.com/tournaments/weekend-open.jpg"
              value={form.cover_image}
              onChange={onChange}
            />
            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <label
                className="admin-action-button rig-fleet__ghost-button"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: coverUploading ? "wait" : "pointer",
                  opacity: coverUploading ? 0.7 : 1,
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={onCoverUpload}
                  disabled={coverUploading}
                  style={{ display: "none" }}
                />
                {coverUploading ? "Uploading cover..." : "Upload cover image"}
              </label>
              {form.cover_image ? (
                <button
                  type="button"
                  className="admin-action-button rig-fleet__ghost-button"
                  onClick={onClearCover}
                >
                  Remove cover
                </button>
              ) : null}
            </div>
            {coverUploadError ? (
              <span style={{ color: "var(--tone-danger-text)", fontSize: "0.9rem" }}>
                {coverUploadError}
              </span>
            ) : null}
            {coverPreviewUrl ? (
              <div
                style={{
                  display: "grid",
                  gap: 10,
                  padding: 12,
                  borderRadius: 16,
                  border: "1px solid var(--border)",
                  background: "var(--surface-elevated)",
                }}
              >
                <img
                  src={coverPreviewUrl}
                  alt="Tournament cover preview"
                  style={{
                    width: "100%",
                    maxHeight: 240,
                    objectFit: "cover",
                    borderRadius: 14,
                  }}
                />
                <span style={{ color: "var(--text-secondary)", fontSize: "0.82rem" }}>
                  Stored value: {form.cover_image}
                </span>
              </div>
            ) : null}
          </div>
        </AdminFormField>
        <AdminFormField
          className="admin-form-span-2"
          label="Summary"
          hint="Short pitch shown in cards and quick previews."
        >
          <textarea
            name="summary"
            placeholder="A fast overview of the tournament, format, and who it is for."
            value={form.summary}
            onChange={onChange}
          />
        </AdminFormField>
        <AdminFormField
          className="admin-form-span-2"
          label="Description"
          hint="Full event details, structure, and what participants should expect."
        >
          <textarea
            name="description"
            placeholder="Tournament description"
            value={form.description}
            onChange={onChange}
          />
        </AdminFormField>
        <AdminFormField
          className="admin-form-span-2"
          label="Rules and format notes"
          hint="Tie-breakers, lobby rules, equipment rules, and reporting steps."
        >
          <textarea
            name="rules"
            placeholder="Rules and format notes"
            value={form.rules}
            onChange={onChange}
          />
        </AdminFormField>

        <label className="admin-toggle-group">
          <span style={{ color: "var(--text)", fontWeight: 700 }}>Spotlight this event</span>
          <span className="admin-toggle-row">
            <input
              type="checkbox"
              name="is_featured"
              checked={form.is_featured}
              onChange={onChange}
            />
            Feature this tournament in discovery surfaces
          </span>
        </label>

        <div className="admin-form-span-2" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            type="submit"
            className="admin-action-button rig-fleet__primary-button"
            disabled={saving}
          >
            {saving ? "Saving..." : editingId ? "Update tournament" : "Create tournament"}
          </button>
          <button
            type="button"
            className="admin-action-button rig-fleet__ghost-button"
            onClick={onResetForm}
            disabled={saving}
          >
            Reset form
          </button>
        </div>
      </form>
    </section>
  );
}

export default TournamentsArenaEditorForm;
