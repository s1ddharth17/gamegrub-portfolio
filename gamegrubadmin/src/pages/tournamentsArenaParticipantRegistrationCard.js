import {
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUS_STYLES,
  formatCurrency,
  formatDateTime,
  PARTICIPANT_STATUS_LABELS,
  PARTICIPANT_STATUS_STYLES,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_STYLES,
  REFUND_STATUS_LABELS,
  REFUND_STATUS_STYLES,
} from "./tournamentsArenaShared";
import {
  actions,
  cardHeader,
  cardSubtitle,
  cardTitle,
  chip,
  chipRow,
  copyBlock,
  copyText,
  copyTitle,
  footerRow,
  footerStatLabel,
  footerStats,
  metaGrid,
  metaLabel,
  metaTile,
  metaValue,
  participantCard,
  participantIdValue,
  participantRosterItem,
  participantRosterList,
  participantRosterName,
  statusPill,
} from "./tournamentsArenaStyles";

function ParticipantRegistrationCard({
  registration,
  registrationSavingId,
  onAttendanceStatusChange,
  onParticipantStatusChange,
  onPaymentAction,
  onRefundAction,
}) {
  const statusStyle =
    PARTICIPANT_STATUS_STYLES[registration.status] || PARTICIPANT_STATUS_STYLES.registered;
  const attendanceKey =
    registration.status === "registered" ? registration.attendance_status || "pending" : "cleared";
  const attendanceStyle =
    ATTENDANCE_STATUS_STYLES[attendanceKey] || ATTENDANCE_STATUS_STYLES.pending;
  const roster = Array.isArray(registration.roster) ? registration.roster : [];
  const registrationTitle = registration.team_name || registration.participant_name || "Unknown player";
  const registrationSubtitle = registration.team_name
    ? `Captain: ${registration.participant_name || "Unknown player"}`
    : registration.participant_email || "No email provided";
  const paymentStatusKey = String(registration.payment_status || "not_due").trim().toLowerCase();
  const paymentStyle =
    PAYMENT_STATUS_STYLES[paymentStatusKey] || PAYMENT_STATUS_STYLES.not_due;
  const refundStatusKey = String(registration.refund_status || "not_applicable")
    .trim()
    .toLowerCase();
  const refundStyle =
    REFUND_STATUS_STYLES[refundStatusKey] || REFUND_STATUS_STYLES.not_applicable;
  const canMarkPaid =
    registration.status === "registered" &&
    Number(registration.amount_due || 0) > 0 &&
    !["paid", "refunded"].includes(paymentStatusKey);
  const canWaive =
    Number(registration.amount_paid || 0) <= 0 && paymentStatusKey !== "waived";
  const canSetPending =
    registration.status === "registered" &&
    Number(registration.amount_paid || 0) <= 0 &&
    paymentStatusKey !== "pending";
  const canMarkNotDue =
    Number(registration.amount_paid || 0) <= 0 && paymentStatusKey !== "not_due";
  const canRequestRefund =
    Boolean(registration.refund_eligible) &&
    ["paid", "partially_refunded"].includes(paymentStatusKey) &&
    !["requested", "processing", "refunded"].includes(refundStatusKey);
  const canProcessRefund =
    ["requested", "processing"].includes(refundStatusKey) &&
    Number(registration.amount_paid || 0) > Number(registration.refund_processed_amount || 0);
  const canRejectRefund = ["requested", "processing"].includes(refundStatusKey);

  return (
    <article key={registration.registration_id} className="admin-surface-hover" style={participantCard}>
      <div style={cardHeader}>
        <div>
          <div style={cardTitle}>{registrationTitle}</div>
          <div style={cardSubtitle}>{registrationSubtitle}</div>
        </div>
        <div
          style={{
            ...statusPill,
            background: statusStyle.background,
            borderColor: statusStyle.border,
            color: statusStyle.color,
          }}
        >
          {PARTICIPANT_STATUS_LABELS[registration.status] || registration.status}
        </div>
      </div>

      <div style={chipRow}>
        <span style={chip("var(--tone-info-bg)", "var(--tone-info-border)", "var(--tone-info-text)")}>
          {(registration.registration_type || "solo").toUpperCase()}
        </span>
        {registration.team_name ? (
          <span
            style={chip(
              "var(--tone-warning-bg)",
              "var(--tone-warning-border)",
              "var(--tone-warning-text)"
            )}
          >
            {registration.roster_count || roster.length} players
          </span>
        ) : null}
        <span
          style={chip(
            "var(--tone-success-bg)",
            "var(--tone-success-border)",
            "var(--tone-success-text)"
          )}
        >
          {registration.seed_number ? `Seed #${registration.seed_number}` : "Unseeded"}
        </span>
        {registration.status === "waitlisted" ? (
          <span
            style={chip(
              "var(--tone-warning-bg)",
              "var(--tone-warning-border)",
              "var(--tone-warning-text)"
            )}
          >
            {registration.waitlist_position ? `Queue #${registration.waitlist_position}` : "Waitlist queued"}
          </span>
        ) : null}
        <span style={chip(attendanceStyle.background, attendanceStyle.border, attendanceStyle.color)}>
          {ATTENDANCE_STATUS_LABELS[attendanceKey] || attendanceKey}
        </span>
        <span style={chip(paymentStyle.background, paymentStyle.border, paymentStyle.color)}>
          {PAYMENT_STATUS_LABELS[paymentStatusKey] || paymentStatusKey}
        </span>
        {refundStatusKey !== "not_applicable" ? (
          <span style={chip(refundStyle.background, refundStyle.border, refundStyle.color)}>
            {REFUND_STATUS_LABELS[refundStatusKey] || refundStatusKey}
          </span>
        ) : null}
        <span style={chip("var(--surface-elevated)", "var(--border)", "var(--text-secondary)")}>
          {registration.participant_mobile || "No mobile"}
        </span>
      </div>

      <div style={metaGrid}>
        <div style={metaTile}>
          <div style={metaLabel}>Registered</div>
          <div style={metaValue}>{formatDateTime(registration.registered_at)}</div>
        </div>
        <div style={metaTile}>
          <div style={metaLabel}>Updated</div>
          <div style={metaValue}>{formatDateTime(registration.updated_at)}</div>
        </div>
        <div style={metaTile}>
          <div style={metaLabel}>{registration.status === "waitlisted" ? "Waitlisted" : "Checked In"}</div>
          <div style={metaValue}>
            {formatDateTime(
              registration.status === "waitlisted"
                ? registration.waitlisted_at
                : registration.checked_in_at
            )}
          </div>
        </div>
        <div style={metaTile}>
          <div style={metaLabel}>{registration.status === "waitlisted" ? "Promoted" : "No-show Marked"}</div>
          <div style={metaValue}>
            {formatDateTime(
              registration.status === "waitlisted"
                ? registration.waitlist_promoted_at
                : registration.no_show_marked_at
            )}
          </div>
        </div>
        <div style={metaTile}>
          <div style={metaLabel}>Amount Due</div>
          <div style={metaValue}>{formatCurrency(registration.amount_due)}</div>
        </div>
        <div style={metaTile}>
          <div style={metaLabel}>Amount Paid</div>
          <div style={metaValue}>{formatCurrency(registration.amount_paid)}</div>
        </div>
        <div style={metaTile}>
          <div style={metaLabel}>Outstanding</div>
          <div style={metaValue}>{formatCurrency(registration.outstanding_amount)}</div>
        </div>
        <div style={metaTile}>
          <div style={metaLabel}>Refundable</div>
          <div style={metaValue}>{formatCurrency(registration.refundable_amount)}</div>
        </div>
      </div>

      {roster.length ? (
        <div style={copyBlock}>
          <div style={copyTitle}>Roster</div>
          <div style={participantRosterList}>
            {roster.map((member) => (
              <div
                key={member.member_id || `${registration.registration_id}-${member.slot_number}`}
                style={participantRosterItem}
              >
                <div style={participantRosterName}>
                  {member.member_name}
                  {member.is_captain ? " (Captain)" : ""}
                </div>
                <div style={copyText}>
                  {[member.member_email, member.member_mobile].filter(Boolean).join(" | ") ||
                    "No contact details"}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={copyBlock}>
        <div style={copyTitle}>Payment & Refund</div>
        <div style={copyText}>
          Payment: {PAYMENT_STATUS_LABELS[paymentStatusKey] || paymentStatusKey}
          {registration.premium_access
            ? ` | ${registration.premium_access_label || "Premium access"}`
            : ""}
          {registration.payment_method ? ` | Method: ${registration.payment_method.toUpperCase()}` : ""}
          {registration.payment_reference ? ` | Ref: ${registration.payment_reference}` : ""}
        </div>
        <div style={copyText}>
          Refund: {REFUND_STATUS_LABELS[refundStatusKey] || refundStatusKey}
          {registration.refund_requested_amount
            ? ` | Requested: ${formatCurrency(registration.refund_requested_amount)}`
            : ""}
          {registration.refund_processed_amount
            ? ` | Processed: ${formatCurrency(registration.refund_processed_amount)}`
            : ""}
        </div>
        {registration.payment_notes ? (
          <div style={copyText}>Payment note: {registration.payment_notes}</div>
        ) : null}
        {registration.refund_notes ? (
          <div style={copyText}>Refund note: {registration.refund_notes}</div>
        ) : null}
      </div>

      <div style={footerRow}>
        <div style={footerStats}>
          <div style={footerStatLabel}>Participant Id</div>
          <div style={participantIdValue}>#{registration.registration_id}</div>
        </div>
        <div style={actions}>
          {registration.status === "registered" ? (
            <>
              {registration.attendance_status !== "checked_in" ? (
                <button
                  type="button"
                  className="admin-action-button rig-fleet__secondary-button is-success"
                  onClick={() => onAttendanceStatusChange(registration, "checked_in")}
                  disabled={registrationSavingId === registration.registration_id}
                >
                  {registrationSavingId === registration.registration_id ? "Saving..." : "Check in"}
                </button>
              ) : null}
              {registration.attendance_status !== "pending" ? (
                <button
                  type="button"
                  className="admin-action-button rig-fleet__ghost-button"
                  onClick={() => onAttendanceStatusChange(registration, "pending")}
                  disabled={registrationSavingId === registration.registration_id}
                >
                  {registrationSavingId === registration.registration_id ? "Saving..." : "Mark pending"}
                </button>
              ) : null}
              {registration.attendance_status !== "no_show" ? (
                <button
                  type="button"
                  className="admin-action-button rig-fleet__secondary-button"
                  onClick={() => onAttendanceStatusChange(registration, "no_show")}
                  disabled={registrationSavingId === registration.registration_id}
                >
                  {registrationSavingId === registration.registration_id ? "Saving..." : "No-show"}
                </button>
              ) : null}
              <button
                type="button"
                className="admin-action-button rig-fleet__ghost-button"
                onClick={() => onParticipantStatusChange(registration, "waitlisted")}
                disabled={registrationSavingId === registration.registration_id}
              >
                {registrationSavingId === registration.registration_id ? "Saving..." : "Move to waitlist"}
              </button>
            </>
          ) : registration.status === "waitlisted" ? (
            <>
              <button
                type="button"
                className="admin-action-button rig-fleet__secondary-button is-success"
                onClick={() => onParticipantStatusChange(registration, "registered")}
                disabled={registrationSavingId === registration.registration_id}
              >
                {registrationSavingId === registration.registration_id ? "Saving..." : "Promote"}
              </button>
              <button
                type="button"
                className="admin-action-button rig-fleet__secondary-button is-danger"
                onClick={() => onParticipantStatusChange(registration, "cancelled")}
                disabled={registrationSavingId === registration.registration_id}
              >
                {registrationSavingId === registration.registration_id ? "Saving..." : "Cancel Entry"}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="admin-action-button rig-fleet__secondary-button is-success"
                onClick={() => onParticipantStatusChange(registration, "registered")}
                disabled={registrationSavingId === registration.registration_id}
              >
                {registrationSavingId === registration.registration_id ? "Saving..." : "Reinstate"}
              </button>
              <button
                type="button"
                className="admin-action-button rig-fleet__ghost-button"
                onClick={() => onParticipantStatusChange(registration, "waitlisted")}
                disabled={registrationSavingId === registration.registration_id}
              >
                {registrationSavingId === registration.registration_id ? "Saving..." : "Waitlist"}
              </button>
            </>
          )}
          {registration.status === "registered" ? (
            <button
              type="button"
              className="admin-action-button rig-fleet__secondary-button is-danger"
              onClick={() => onParticipantStatusChange(registration, "cancelled")}
              disabled={registrationSavingId === registration.registration_id}
            >
              {registrationSavingId === registration.registration_id ? "Saving..." : "Cancel Entry"}
            </button>
          ) : null}
          {canMarkPaid ? (
            <button
              type="button"
              className="admin-action-button rig-fleet__secondary-button is-success"
              onClick={() => onPaymentAction(registration, "mark_paid")}
              disabled={registrationSavingId === registration.registration_id}
            >
              {registrationSavingId === registration.registration_id ? "Saving..." : "Mark paid"}
            </button>
          ) : null}
          {canWaive ? (
            <button
              type="button"
              className="admin-action-button rig-fleet__ghost-button"
              onClick={() => onPaymentAction(registration, "waive")}
              disabled={registrationSavingId === registration.registration_id}
            >
              {registrationSavingId === registration.registration_id ? "Saving..." : "Waive fee"}
            </button>
          ) : null}
          {canSetPending ? (
            <button
              type="button"
              className="admin-action-button rig-fleet__ghost-button"
              onClick={() => onPaymentAction(registration, "set_pending")}
              disabled={registrationSavingId === registration.registration_id}
            >
              {registrationSavingId === registration.registration_id ? "Saving..." : "Set pending"}
            </button>
          ) : null}
          {canMarkNotDue ? (
            <button
              type="button"
              className="admin-action-button rig-fleet__ghost-button"
              onClick={() => onPaymentAction(registration, "set_not_due")}
              disabled={registrationSavingId === registration.registration_id}
            >
              {registrationSavingId === registration.registration_id ? "Saving..." : "Not due"}
            </button>
          ) : null}
          {canRequestRefund ? (
            <button
              type="button"
              className="admin-action-button rig-fleet__secondary-button"
              onClick={() => onRefundAction(registration, "request")}
              disabled={registrationSavingId === registration.registration_id}
            >
              {registrationSavingId === registration.registration_id ? "Saving..." : "Request refund"}
            </button>
          ) : null}
          {canProcessRefund ? (
            <>
              <button
                type="button"
                className="admin-action-button rig-fleet__ghost-button"
                onClick={() => onRefundAction(registration, "processing")}
                disabled={registrationSavingId === registration.registration_id}
              >
                {registrationSavingId === registration.registration_id ? "Saving..." : "Refund processing"}
              </button>
              <button
                type="button"
                className="admin-action-button rig-fleet__secondary-button is-success"
                onClick={() => onRefundAction(registration, "refund")}
                disabled={registrationSavingId === registration.registration_id}
              >
                {registrationSavingId === registration.registration_id ? "Saving..." : "Complete refund"}
              </button>
            </>
          ) : null}
          {canRejectRefund ? (
            <button
              type="button"
              className="admin-action-button rig-fleet__secondary-button is-danger"
              onClick={() => onRefundAction(registration, "reject")}
              disabled={registrationSavingId === registration.registration_id}
            >
              {registrationSavingId === registration.registration_id ? "Saving..." : "Reject refund"}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default ParticipantRegistrationCard;
