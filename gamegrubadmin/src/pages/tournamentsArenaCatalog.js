import {
  formatCurrency,
  formatDateTime,
  formatRefundPolicy,
  OPERATIONS_STAGE_LABELS,
  OPERATIONS_STAGE_STYLES,
  STATUS_LABELS,
  STATUS_STYLES,
} from "./tournamentsArenaShared";
import {
  actions,
  card,
  cardHeader,
  cardSubtitle,
  cardTitle,
  chip,
  chipRow,
  copyBlock,
  copyText,
  copyTitle,
  errorBanner,
  footerRow,
  footerStatLabel,
  footerStatValue,
  footerStats,
  grid,
  metaGrid,
  metaLabel,
  metaTile,
  metaValue,
  statusPill,
} from "./tournamentsArenaStyles";

const TOURNAMENT_FILTER_OPTIONS = [
  ["all", "All"],
  ["draft", "Draft"],
  ["published", "Published"],
  ["cancelled", "Cancelled"],
  ["completed", "Completed"],
];

function TournamentCatalogCard({
  tournament,
  onManageParticipants,
  onEdit,
  onTriggerStatusAction,
}) {
  const statusStyle = STATUS_STYLES[tournament.status] || STATUS_STYLES.draft;
  const registrationLabel = tournament.can_register
    ? "Registration open"
    : "Registration closed";
  const operationsStageStyle =
    OPERATIONS_STAGE_STYLES[tournament.operations_stage] ||
    OPERATIONS_STAGE_STYLES.registrations;

  return (
    <article key={tournament.tournament_id} className="admin-surface-hover" style={card}>
      <div style={cardHeader}>
        <div>
          <div style={cardTitle}>{tournament.title}</div>
          <div style={cardSubtitle}>
            {tournament.game_title} | {STATUS_LABELS[tournament.status] || tournament.status}
          </div>
        </div>
        <div
          style={{
            ...statusPill,
            background: statusStyle.background,
            borderColor: statusStyle.border,
            color: statusStyle.color,
          }}
        >
          {STATUS_LABELS[tournament.status] || tournament.status}
        </div>
      </div>

      <div style={chipRow}>
        <span style={chip("var(--tone-info-bg)", "var(--tone-info-border)", "var(--tone-info-text)")}>
          {tournament.format.toUpperCase()} | {tournament.team_size}P
        </span>
        <span
          style={chip(
            "var(--tone-success-bg)",
            "var(--tone-success-border)",
            "var(--tone-success-text)"
          )}
        >
          {registrationLabel}
        </span>
        <span
          style={chip(
            operationsStageStyle.background,
            operationsStageStyle.border,
            operationsStageStyle.color
          )}
        >
          {OPERATIONS_STAGE_LABELS[tournament.operations_stage] || tournament.operations_stage}
        </span>
        <span style={chip("var(--surface-elevated)", "var(--border)", "var(--text-secondary)")}>
          {tournament.seeded_count || 0}/{tournament.registered_count || 0} seeded
        </span>
        <span
          style={chip(
            "var(--tone-success-bg)",
            "var(--tone-success-border)",
            "var(--tone-success-text)"
          )}
        >
          {tournament.checked_in_count || 0} checked in
        </span>
        {tournament.has_bracket ? (
          <span style={chip("var(--tone-gold-bg)", "var(--tone-gold-border)", "var(--tone-gold-text)")}>
            {tournament.completed_bracket_match_count || 0}/
            {tournament.bracket_match_count || 0} matches done
          </span>
        ) : null}
        {tournament.is_featured ? (
          <span
            style={chip(
              "var(--tone-warning-bg)",
              "var(--tone-warning-border)",
              "var(--tone-warning-text)"
            )}
          >
            Featured
          </span>
        ) : null}
      </div>

      <div style={metaGrid}>
        <div style={metaTile}>
          <div style={metaLabel}>Starts</div>
          <div style={metaValue}>{formatDateTime(tournament.start_at)}</div>
        </div>
        <div style={metaTile}>
          <div style={metaLabel}>Venue</div>
          <div style={metaValue}>{tournament.location_label || "GameGrub Arena"}</div>
        </div>
        <div style={metaTile}>
          <div style={metaLabel}>Entry Fee</div>
          <div style={metaValue}>{formatCurrency(tournament.entry_fee)}</div>
        </div>
        <div style={metaTile}>
          <div style={metaLabel}>Prize Pool</div>
          <div style={metaValue}>
            {formatCurrency(tournament.effective_prize_pool ?? tournament.prize_pool)}
          </div>
        </div>
        {tournament.is_sponsored ? (
          <div style={metaTile}>
            <div style={metaLabel}>Sponsor</div>
            <div style={metaValue}>{tournament.sponsor_name || "Sponsored"}</div>
          </div>
        ) : null}
        {tournament.is_premium ? (
          <div style={metaTile}>
            <div style={metaLabel}>Premium</div>
            <div style={metaValue}>
              {(tournament.premium_label || "Premium access") +
                ` | ${formatCurrency(tournament.premium_entry_fee)}`}
            </div>
          </div>
        ) : null}
        <div style={metaTile}>
          <div style={metaLabel}>Refund Policy</div>
          <div style={metaValue}>{formatRefundPolicy(tournament)}</div>
        </div>
      </div>

      <div style={copyBlock}>
        <div style={copyTitle}>Summary</div>
        <div style={copyText}>
          {tournament.summary || tournament.description || "Tournament details can be added here."}
        </div>
      </div>

      <div style={footerRow}>
        <div style={footerStats}>
          <div style={footerStatLabel}>Capacity</div>
          <div style={footerStatValue}>
            {tournament.registered_count}/{tournament.max_participants}
          </div>
        </div>
        <div style={actions}>
          <button
            type="button"
            className="admin-action-button rig-fleet__secondary-button"
            onClick={() => onManageParticipants(tournament)}
          >
            Participants
          </button>
          <button
            type="button"
            className="admin-action-button rig-fleet__ghost-button"
            onClick={() => onEdit(tournament)}
          >
            Edit
          </button>
          {tournament.status !== "published" ? (
            <button
              type="button"
              className="admin-action-button rig-fleet__secondary-button is-success"
              onClick={() =>
                onTriggerStatusAction(
                  tournament.tournament_id,
                  "publish",
                  `Publish ${tournament.title}?`
                )
              }
            >
              Publish
            </button>
          ) : null}
          {tournament.status !== "cancelled" ? (
            <button
              type="button"
              className="admin-action-button rig-fleet__secondary-button is-danger"
              onClick={() =>
                onTriggerStatusAction(
                  tournament.tournament_id,
                  "cancel",
                  `Cancel ${tournament.title}?`
                )
              }
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function TournamentsArenaCatalog({
  activeFilter,
  onActiveFilterChange,
  error,
  loading,
  tournaments,
  onManageParticipants,
  onEdit,
  onTriggerStatusAction,
}) {
  return (
    <>
      <div className="admin-panel-soft admin-filter-strip">
        <div className="admin-filter-strip__actions">
          {TOURNAMENT_FILTER_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`admin-filter-chip${activeFilter === value ? " is-active" : ""}`}
              onClick={() => onActiveFilterChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? <div style={errorBanner}>{error}</div> : null}

      {loading ? (
        <div className="admin-empty-state">Loading tournaments...</div>
      ) : tournaments.length === 0 ? (
        <div className="admin-empty-state">No tournaments match the current filter.</div>
      ) : (
        <div style={grid}>
          {tournaments.map((tournament) => (
            <TournamentCatalogCard
              key={tournament.tournament_id}
              tournament={tournament}
              onManageParticipants={onManageParticipants}
              onEdit={onEdit}
              onTriggerStatusAction={onTriggerStatusAction}
            />
          ))}
        </div>
      )}
    </>
  );
}

export default TournamentsArenaCatalog;
