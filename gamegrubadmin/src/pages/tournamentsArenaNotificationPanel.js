import {
  formatDateTime,
  NOTIFICATION_EVENT_LABELS,
  NOTIFICATION_SCOPE_LABELS,
} from "./tournamentsArenaShared";
import {
  cardHeader,
  cardSubtitle,
  cardTitle,
  chip,
  chipRow,
  copyBlock,
  copyText,
  notificationCampaignCard,
  notificationCampaignList,
  operationsPanel,
  participantToolbar,
  sectionCopy,
  sectionHeader,
  sectionTitle,
} from "./tournamentsArenaStyles";

function TournamentsArenaNotificationPanel({
  mailDeliveryAvailable,
  notificationCampaigns,
  notificationForm,
  notificationLoading,
  notificationSending,
  onNotificationFormChange,
  onRefreshNotifications,
  onResetNotificationForm,
  onSendNotification,
  selectedTournament,
}) {
  return (
    <div style={operationsPanel}>
      <div style={sectionHeader}>
        <div>
          <div style={sectionTitle}>Player Updates</div>
          <div style={sectionCopy}>
            Send a tournament update to registered players, then track delivery and read progress
            here.
          </div>
        </div>
        <div style={participantToolbar}>
          <button
            type="button"
            className="admin-action-button rig-fleet__ghost-button"
            onClick={() => onRefreshNotifications(selectedTournament.tournament_id)}
            disabled={notificationLoading || notificationSending}
          >
            {notificationLoading ? "Refreshing..." : "Refresh updates"}
          </button>
        </div>
      </div>

      <form onSubmit={onSendNotification} className="admin-form-grid" style={{ marginBottom: 18 }}>
        <input
          name="title"
          placeholder="Update title"
          value={notificationForm.title}
          onChange={onNotificationFormChange}
        />
        <select
          name="recipient_scope"
          value={notificationForm.recipient_scope}
          onChange={onNotificationFormChange}
        >
          <option value="all_registered">All registered players</option>
          <option value="checked_in">Checked-in only</option>
          <option value="eligible_bracket">Bracket-eligible players</option>
          <option value="waitlisted">Waitlist only</option>
        </select>
        <textarea
          className="admin-form-span-2"
          name="message"
          placeholder="Write the update players should receive"
          value={notificationForm.message}
          onChange={onNotificationFormChange}
        />
        <label className="admin-toggle-group">
          <span style={{ color: "var(--text)", fontWeight: 700 }}>Email delivery</span>
          <span className="admin-toggle-row">
            <input
              type="checkbox"
              name="send_email"
              checked={notificationForm.send_email}
              onChange={onNotificationFormChange}
            />
            {mailDeliveryAvailable
              ? "Also attempt email delivery for this update"
              : "Store in-app only. SMTP is not configured right now."}
          </span>
        </label>
        <div className="admin-form-span-2" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            type="submit"
            className="admin-action-button rig-fleet__secondary-button is-success"
            disabled={notificationSending}
          >
            {notificationSending ? "Sending..." : "Send update"}
          </button>
          <button
            type="button"
            className="admin-action-button rig-fleet__ghost-button"
            onClick={onResetNotificationForm}
            disabled={notificationSending}
          >
            Reset update
          </button>
        </div>
      </form>

      {notificationLoading ? (
        <div className="admin-empty-state">Loading tournament update history...</div>
      ) : notificationCampaigns.length === 0 ? (
        <div className="admin-empty-state">
          No tournament updates have been sent yet for this event.
        </div>
      ) : (
        <div style={notificationCampaignList}>
          {notificationCampaigns.map((campaign) => (
            <article key={campaign.campaign_id} style={notificationCampaignCard}>
              <div style={cardHeader}>
                <div>
                  <div style={cardTitle}>{campaign.title}</div>
                  <div style={cardSubtitle}>
                    {NOTIFICATION_EVENT_LABELS[campaign.event_type] || campaign.event_type} |{" "}
                    {NOTIFICATION_SCOPE_LABELS[campaign.recipient_scope] ||
                      campaign.recipient_scope}
                  </div>
                </div>
                <div style={copyText}>{formatDateTime(campaign.created_at)}</div>
              </div>

              <div style={chipRow}>
                <span
                  style={chip(
                    "var(--tone-info-bg)",
                    "var(--tone-info-border)",
                    "var(--tone-info-text)"
                  )}
                >
                  {campaign.delivery_count || 0} delivered
                </span>
                <span
                  style={chip(
                    "var(--tone-success-bg)",
                    "var(--tone-success-border)",
                    "var(--tone-success-text)"
                  )}
                >
                  {campaign.read_count || 0} read
                </span>
                <span
                  style={chip(
                    "var(--tone-warning-bg)",
                    "var(--tone-warning-border)",
                    "var(--tone-warning-text)"
                  )}
                >
                  {campaign.emailed_count || 0} emailed
                </span>
                {campaign.email_failed_count ? (
                  <span
                    style={chip(
                      "var(--tone-danger-bg)",
                      "var(--tone-danger-border)",
                      "var(--tone-danger-text)"
                    )}
                  >
                    {campaign.email_failed_count} email failures
                  </span>
                ) : null}
              </div>

              <div style={copyBlock}>
                <div style={copyText}>{campaign.message}</div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default TournamentsArenaNotificationPanel;
