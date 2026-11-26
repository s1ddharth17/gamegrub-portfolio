import AdminMetricCard from "../components/AdminMetricCard";
import TournamentsArenaBracketPanel from "./tournamentsArenaBracketPanel";
import TournamentsArenaNotificationPanel from "./tournamentsArenaNotificationPanel";
import ParticipantRegistrationCard from "./tournamentsArenaParticipantRegistrationCard";
import TournamentsArenaSeedingPanel from "./tournamentsArenaSeedingPanel";
import {
  errorBanner,
  participantGrid,
  participantToolbar,
  sectionCopy,
  sectionHeader,
  sectionTitle,
} from "./tournamentsArenaStyles";

const REGISTRATION_FILTER_OPTIONS = [
  ["all", "All"],
  ["registered", "Registered"],
  ["waitlisted", "Waitlisted"],
  ["cancelled", "Cancelled"],
];

const ATTENDANCE_FILTER_OPTIONS = [
  ["all", "Any attendance"],
  ["pending", "Pending"],
  ["checked_in", "Checked in"],
  ["no_show", "No-show"],
];

function TournamentsArenaParticipantConsole({
  selectedTournament,
  participantCounts,
  registrationSearch,
  onRegistrationSearchChange,
  onRefreshRegistrations,
  registrationLoading,
  onClose,
  activeRegistrations,
  seedingSaving,
  operationsSaving,
  onAutoSeed,
  onSaveSeeding,
  onOperationsStageChange,
  seededCount,
  seedingRegistrations,
  seedDrafts,
  onSeedChange,
  bracketLoading,
  bracketSaving,
  onGenerateBracket,
  onRefreshBracket,
  eligibleBracketRegistrations,
  bracket,
  currentBracketRoundLabel,
  bracketRounds,
  matchDrafts,
  onMatchDraftChange,
  onReportMatchWinner,
  matchResultSavingId,
  notificationLoading,
  notificationSending,
  onRefreshNotifications,
  notificationForm,
  onNotificationFormChange,
  mailDeliveryAvailable,
  onSendNotification,
  onResetNotificationForm,
  notificationCampaigns,
  registrationFilter,
  onRegistrationFilterChange,
  attendanceFilter,
  onAttendanceFilterChange,
  registrationError,
  filteredRegistrations,
  registrationSavingId,
  onAttendanceStatusChange,
  onParticipantStatusChange,
  onPaymentAction,
  onRefundAction,
}) {
  if (!selectedTournament) {
    return null;
  }

  return (
    <section className="admin-panel admin-surface-hover" style={{ marginBottom: 18 }}>
      <div style={sectionHeader}>
        <div>
          <div style={sectionTitle}>Participant Console</div>
          <div style={sectionCopy}>
            {selectedTournament.title} | {selectedTournament.game_title} |{" "}
            {participantCounts.registered}/{selectedTournament.max_participants} active slots filled
            {participantCounts.waitlisted ? ` | ${participantCounts.waitlisted} on waitlist` : ""}
          </div>
        </div>
        <div style={participantToolbar}>
          <input
            className="admin-search"
            placeholder="Search name, email, mobile, or status"
            value={registrationSearch}
            onChange={(event) => onRegistrationSearchChange(event.target.value)}
          />
          <button
            type="button"
            className="admin-action-button rig-fleet__refresh-button"
            onClick={() => onRefreshRegistrations(selectedTournament.tournament_id)}
            disabled={registrationLoading}
          >
            {registrationLoading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            className="admin-action-button rig-fleet__ghost-button"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>

      <div className="admin-metric-grid" style={{ marginBottom: 18 }}>
        <AdminMetricCard
          icon="RG"
          label="Registered"
          value={participantCounts.registered}
          hint="Active tournament slots"
          tone="cool"
        />
        <AdminMetricCard
          icon="CN"
          label="Waitlist"
          value={participantCounts.waitlisted}
          hint="Queued for the next open slot"
          tone="warm"
        />
        <AdminMetricCard
          icon="CX"
          label="Cancelled"
          value={participantCounts.cancelled}
          hint="Withdrawn or removed entries"
          tone="warm"
        />
        <AdminMetricCard
          icon="CP"
          label="Capacity"
          value={`${selectedTournament.registered_count}/${selectedTournament.max_participants}`}
          hint={`${selectedTournament.available_slots} slots open`}
          tone="gold"
        />
        <AdminMetricCard
          icon="CI"
          label="Checked in"
          value={participantCounts.checkedIn}
          hint={`${participantCounts.pending} still pending`}
          tone="cool"
        />
        <AdminMetricCard
          icon="NS"
          label="No-show"
          value={participantCounts.noShow}
          hint="Attendance exceptions"
          tone="warm"
        />
        <AdminMetricCard
          icon="PD"
          label="Payments due"
          value={participantCounts.paymentPending}
          hint="Pending entry fee collection"
          tone="warm"
        />
        <AdminMetricCard
          icon="PY"
          label="Paid"
          value={participantCounts.paid}
          hint="Financially cleared entries"
          tone="cool"
        />
        <AdminMetricCard
          icon="RF"
          label="Refund queue"
          value={participantCounts.refundOpen}
          hint="Requested or processing"
          tone="gold"
        />
      </div>

      <TournamentsArenaSeedingPanel
        activeRegistrations={activeRegistrations}
        onAutoSeed={onAutoSeed}
        onOperationsStageChange={onOperationsStageChange}
        onSaveSeeding={onSaveSeeding}
        onSeedChange={onSeedChange}
        operationsSaving={operationsSaving}
        seededCount={seededCount}
        seedDrafts={seedDrafts}
        seedingRegistrations={seedingRegistrations}
        seedingSaving={seedingSaving}
        selectedTournament={selectedTournament}
      />

      <TournamentsArenaBracketPanel
        bracket={bracket}
        bracketLoading={bracketLoading}
        bracketRounds={bracketRounds}
        bracketSaving={bracketSaving}
        currentBracketRoundLabel={currentBracketRoundLabel}
        eligibleBracketRegistrations={eligibleBracketRegistrations}
        matchDrafts={matchDrafts}
        matchResultSavingId={matchResultSavingId}
        onGenerateBracket={onGenerateBracket}
        onMatchDraftChange={onMatchDraftChange}
        onRefreshBracket={onRefreshBracket}
        onReportMatchWinner={onReportMatchWinner}
        operationsSaving={operationsSaving}
        seedingSaving={seedingSaving}
        selectedTournament={selectedTournament}
      />

      <TournamentsArenaNotificationPanel
        mailDeliveryAvailable={mailDeliveryAvailable}
        notificationCampaigns={notificationCampaigns}
        notificationForm={notificationForm}
        notificationLoading={notificationLoading}
        notificationSending={notificationSending}
        onNotificationFormChange={onNotificationFormChange}
        onRefreshNotifications={onRefreshNotifications}
        onResetNotificationForm={onResetNotificationForm}
        onSendNotification={onSendNotification}
        selectedTournament={selectedTournament}
      />

      <div className="admin-panel-soft admin-filter-strip" style={{ marginBottom: 18 }}>
        <div className="admin-filter-strip__actions">
          {REGISTRATION_FILTER_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`admin-filter-chip${registrationFilter === value ? " is-active" : ""}`}
              onClick={() => onRegistrationFilterChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-panel-soft admin-filter-strip" style={{ marginBottom: 18 }}>
        <div className="admin-filter-strip__actions">
          {ATTENDANCE_FILTER_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`admin-filter-chip${attendanceFilter === value ? " is-active" : ""}`}
              onClick={() => onAttendanceFilterChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {registrationError ? <div style={errorBanner}>{registrationError}</div> : null}

      {registrationLoading ? (
        <div className="admin-empty-state">Loading tournament participants...</div>
      ) : filteredRegistrations.length === 0 ? (
        <div className="admin-empty-state">
          No participants match the current filter for this tournament yet.
        </div>
      ) : (
        <div style={participantGrid}>
          {filteredRegistrations.map((registration) => (
            <ParticipantRegistrationCard
              key={registration.registration_id}
              registration={registration}
              registrationSavingId={registrationSavingId}
              onAttendanceStatusChange={onAttendanceStatusChange}
              onParticipantStatusChange={onParticipantStatusChange}
              onPaymentAction={onPaymentAction}
              onRefundAction={onRefundAction}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default TournamentsArenaParticipantConsole;
