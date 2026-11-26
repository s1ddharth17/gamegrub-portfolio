import AdminMetricCard from "../components/AdminMetricCard";
import {
  formatDateTime,
  OPERATIONS_STAGE_LABELS,
  OPERATIONS_STAGE_STYLES,
} from "./tournamentsArenaShared";
import {
  cardSubtitle,
  chip,
  operationsCopy,
  operationsPanel,
  operationsStageRow,
  participantToolbar,
  sectionCopy,
  sectionHeader,
  sectionTitle,
  seedInput,
  seedingBoard,
  seedingControls,
  seedingRow,
  seedingTitle,
  statusPill,
} from "./tournamentsArenaStyles";

function TournamentsArenaSeedingPanel({
  activeRegistrations,
  onAutoSeed,
  onOperationsStageChange,
  onSaveSeeding,
  onSeedChange,
  operationsSaving,
  seededCount,
  seedDrafts,
  seedingRegistrations,
  seedingSaving,
  selectedTournament,
}) {
  return (
    <div style={operationsPanel}>
      <div style={sectionHeader}>
        <div>
          <div style={sectionTitle}>Bracket Handoff</div>
          <div style={sectionCopy}>
            Seed the active field here, then mark the tournament ready when the board is complete.
          </div>
        </div>
        <div style={participantToolbar}>
          <button
            type="button"
            className="admin-action-button rig-fleet__ghost-button"
            onClick={onAutoSeed}
            disabled={!activeRegistrations.length || seedingSaving || operationsSaving}
          >
            Auto seed
          </button>
          <button
            type="button"
            className="admin-action-button rig-fleet__secondary-button"
            onClick={onSaveSeeding}
            disabled={!activeRegistrations.length || seedingSaving || operationsSaving}
          >
            {seedingSaving ? "Saving..." : "Save seeding"}
          </button>
          <button
            type="button"
            className="admin-action-button rig-fleet__ghost-button"
            onClick={() => onOperationsStageChange("registrations")}
            disabled={operationsSaving || seedingSaving}
          >
            Mark registrations
          </button>
          <button
            type="button"
            className="admin-action-button rig-fleet__secondary-button is-success"
            onClick={() => onOperationsStageChange("ready_for_brackets")}
            disabled={
              operationsSaving ||
              seedingSaving ||
              !selectedTournament.can_handoff_to_brackets
            }
          >
            {operationsSaving ? "Updating..." : "Ready for brackets"}
          </button>
        </div>
      </div>

      <div className="admin-metric-grid" style={{ marginBottom: 18 }}>
        <AdminMetricCard
          icon="SD"
          label="Seeded"
          value={`${seededCount}/${activeRegistrations.length}`}
          hint={
            activeRegistrations.length
              ? `${Math.max(activeRegistrations.length - seededCount, 0)} still need a seed`
              : "No active registrations yet"
          }
          tone="info"
        />
        <AdminMetricCard
          icon="OP"
          label="Ops Stage"
          value={
            OPERATIONS_STAGE_LABELS[selectedTournament.operations_stage] ||
            selectedTournament.operations_stage
          }
          hint={
            selectedTournament.bracket_handoff_at
              ? `Handed off ${formatDateTime(selectedTournament.bracket_handoff_at)}`
              : "Bracket handoff not recorded yet"
          }
          tone="cool"
        />
      </div>

      <div style={operationsStageRow}>
        <div
          style={{
            ...statusPill,
            ...(OPERATIONS_STAGE_STYLES[selectedTournament.operations_stage] ||
              OPERATIONS_STAGE_STYLES.registrations),
          }}
        >
          {OPERATIONS_STAGE_LABELS[selectedTournament.operations_stage] ||
            selectedTournament.operations_stage}
        </div>
        <div style={operationsCopy}>
          {selectedTournament.can_handoff_to_brackets
            ? "The seeding board is complete and ready for bracket handoff."
            : "Finish assigning unique seeds to every active registration before handoff."}
        </div>
      </div>

      {activeRegistrations.length === 0 ? (
        <div className="admin-empty-state">No active registrations are available to seed yet.</div>
      ) : (
        <div style={seedingBoard}>
          {seedingRegistrations.map((registration) => (
            <div key={registration.registration_id} style={seedingRow}>
              <div>
                <div style={seedingTitle}>
                  {registration.team_name || registration.participant_name || "Unknown player"}
                </div>
                <div style={cardSubtitle}>
                  {registration.team_name
                    ? `Captain: ${registration.participant_name || "Unknown player"}`
                    : registration.participant_email || "No email provided"}
                </div>
              </div>
              <div style={seedingControls}>
                <span
                  style={chip(
                    "var(--surface-elevated)",
                    "var(--border)",
                    "var(--text-secondary)"
                  )}
                >
                  {registration.registration_type === "team"
                    ? `${registration.roster_count || 0} players`
                    : "Solo"}
                </span>
                <input
                  type="number"
                  min="1"
                  max={Math.max(activeRegistrations.length, 1)}
                  value={seedDrafts[registration.registration_id] ?? ""}
                  onChange={(event) =>
                    onSeedChange(registration.registration_id, event.target.value)
                  }
                  style={seedInput}
                  placeholder="#"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TournamentsArenaSeedingPanel;
