const { query } = require("../utils/db");
const { createCustomerNotification } = require("../utils/customerNotifications");
const { isMailConfigured, sendMail } = require("../utils/mailer");
const {
  TOURNAMENT_NOTIFICATION_EMAIL_STATUS_FAILED,
  TOURNAMENT_NOTIFICATION_EMAIL_STATUS_PENDING,
  TOURNAMENT_NOTIFICATION_EMAIL_STATUS_SENT,
  TOURNAMENT_NOTIFICATION_EMAIL_STATUS_SKIPPED,
  normalizeTournamentNotificationScope,
  serializeTournamentNotification,
  serializeTournamentNotificationCampaign,
} = require("../utils/tournamentNotifications");
const {
  TOURNAMENT_ATTENDANCE_STATUS_CHECKED_IN,
  TOURNAMENT_ATTENDANCE_STATUS_NO_SHOW,
  TOURNAMENT_ATTENDANCE_STATUS_PENDING,
  TOURNAMENT_MATCH_STATUS_PENDING,
  TOURNAMENT_REGISTRATION_STATUS_REGISTERED,
  TOURNAMENT_REGISTRATION_STATUS_WAITLISTED,
  TOURNAMENT_REGISTRATION_TYPE_SOLO,
  slugifyTournamentTitle,
} = require("../utils/tournaments");
const {
  TOURNAMENT_COMMUNITY_POST_STATUS_PUBLISHED,
} = require("../utils/tournamentContent");

function isInlineImageData(value) {
  return String(value || "").trim().toLowerCase().startsWith("data:image/");
}

function shouldDeleteStoredCoverImage(reference) {
  const normalized = String(reference || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return !(
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("data:") ||
    normalized.startsWith("blob:")
  );
}

function buildAdminOrderSql() {
  return `
    ORDER BY
      FIELD(status, 'published', 'draft', 'cancelled', 'completed'),
      is_featured DESC,
      start_at ASC,
      tournament_id DESC
  `;
}

function buildPublicOrderSql() {
  return `
    ORDER BY
      is_featured DESC,
      CASE WHEN start_at >= NOW() THEN 0 ELSE 1 END ASC,
      CASE WHEN start_at >= NOW() THEN start_at END ASC,
      CASE WHEN start_at < NOW() THEN start_at END DESC,
      tournament_id DESC
  `;
}

function buildTournamentSelectFields(alias = "") {
  const tableAlias = alias ? `${alias}.` : "";
  const star = alias ? `${alias}.*` : "*";

  return `
    ${star},
    (
      SELECT b.name
      FROM businesses b
      WHERE b.business_id = ${tableAlias}business_id
      LIMIT 1
    ) AS business_name,
    (
      SELECT b.slug
      FROM businesses b
      WHERE b.business_id = ${tableAlias}business_id
      LIMIT 1
    ) AS business_slug,
    (
      SELECT b.tagline
      FROM businesses b
      WHERE b.business_id = ${tableAlias}business_id
      LIMIT 1
    ) AS business_tagline,
    (
      SELECT b.city
      FROM businesses b
      WHERE b.business_id = ${tableAlias}business_id
      LIMIT 1
    ) AS business_city,
    (
      SELECT b.state
      FROM businesses b
      WHERE b.business_id = ${tableAlias}business_id
      LIMIT 1
    ) AS business_state,
    (
      SELECT b.address_line1
      FROM businesses b
      WHERE b.business_id = ${tableAlias}business_id
      LIMIT 1
    ) AS business_address_line1,
    (
      SELECT COALESCE(NULLIF(b.timezone, ''), 'Asia/Kolkata')
      FROM businesses b
      WHERE b.business_id = ${tableAlias}business_id
      LIMIT 1
    ) AS business_timezone,
    (
      SELECT COUNT(*)
      FROM tournament_bracket_seeds tbs
      WHERE tbs.tournament_id = ${tableAlias}tournament_id
    ) AS seeded_count,
    (
      SELECT COUNT(*)
      FROM tournament_bracket_matches tbm
      WHERE tbm.tournament_id = ${tableAlias}tournament_id
    ) AS bracket_match_count,
    (
      SELECT COUNT(*)
      FROM tournament_bracket_matches tbm
      WHERE tbm.tournament_id = ${tableAlias}tournament_id
      AND tbm.status <> '${TOURNAMENT_MATCH_STATUS_PENDING}'
    ) AS completed_bracket_match_count,
    (
      SELECT COUNT(*)
      FROM tournament_registrations tr_attendance
      WHERE tr_attendance.tournament_id = ${tableAlias}tournament_id
      AND tr_attendance.status = '${TOURNAMENT_REGISTRATION_STATUS_REGISTERED}'
      AND tr_attendance.attendance_status = '${TOURNAMENT_ATTENDANCE_STATUS_CHECKED_IN}'
    ) AS checked_in_count,
    (
      SELECT COUNT(*)
      FROM tournament_registrations tr_attendance
      WHERE tr_attendance.tournament_id = ${tableAlias}tournament_id
      AND tr_attendance.status = '${TOURNAMENT_REGISTRATION_STATUS_REGISTERED}'
      AND tr_attendance.attendance_status = '${TOURNAMENT_ATTENDANCE_STATUS_NO_SHOW}'
    ) AS no_show_count,
    (
      SELECT COUNT(*)
      FROM tournament_registrations tr_waitlist
      WHERE tr_waitlist.tournament_id = ${tableAlias}tournament_id
      AND tr_waitlist.status = '${TOURNAMENT_REGISTRATION_STATUS_WAITLISTED}'
    ) AS waitlist_count
  `;
}

function buildTournamentRegistrationProjection(alias = "tr") {
  const tableAlias = alias ? `${alias}.` : "";

  return `
    ${tableAlias}registration_id,
    ${tableAlias}user_id,
    ${tableAlias}team_id,
    ${tableAlias}registration_type,
    ${tableAlias}status AS registration_status,
    ${tableAlias}attendance_status,
    ${tableAlias}checked_in_at,
    ${tableAlias}no_show_marked_at,
    ${tableAlias}participant_name,
    ${tableAlias}participant_email,
    ${tableAlias}participant_mobile,
    ${tableAlias}waitlisted_at,
    ${tableAlias}waitlist_promoted_at,
    ${tableAlias}team_name,
    ${tableAlias}created_at AS registered_at,
    CASE
      WHEN ${tableAlias}status = '${TOURNAMENT_REGISTRATION_STATUS_WAITLISTED}'
      THEN (
        SELECT COUNT(*)
        FROM tournament_registrations tr_wait_rank
        WHERE tr_wait_rank.tournament_id = ${tableAlias}tournament_id
        AND tr_wait_rank.status = '${TOURNAMENT_REGISTRATION_STATUS_WAITLISTED}'
        AND (
          tr_wait_rank.waitlisted_at < ${tableAlias}waitlisted_at
          OR (
            tr_wait_rank.waitlisted_at = ${tableAlias}waitlisted_at
            AND tr_wait_rank.registration_id <= ${tableAlias}registration_id
          )
        )
      )
      ELSE NULL
    END AS waitlist_position
  `;
}

function buildTournamentRegistrationPaymentProjection(alias = "trp") {
  const tableAlias = alias ? `${alias}.` : "";

  return `
    ${tableAlias}registration_payment_id,
    ${tableAlias}premium_access,
    ${tableAlias}amount_due,
    ${tableAlias}premium_access_fee,
    ${tableAlias}premium_access_label,
    ${tableAlias}amount_paid,
    ${tableAlias}payment_status,
    ${tableAlias}payment_method,
    ${tableAlias}payment_reference,
    ${tableAlias}payment_notes,
    ${tableAlias}paid_at,
    ${tableAlias}refund_status,
    ${tableAlias}refund_requested_amount,
    ${tableAlias}refund_processed_amount,
    ${tableAlias}refund_requested_at,
    ${tableAlias}refund_processed_at,
    ${tableAlias}refund_notes
  `;
}

function buildTournamentNotificationFields(alias = "tn") {
  const tableAlias = alias ? `${alias}.` : "";

  return `
    ${tableAlias}notification_id,
    ${tableAlias}campaign_id,
    ${tableAlias}tournament_id,
    ${tableAlias}registration_id,
    ${tableAlias}user_id,
    ${tableAlias}event_type,
    ${tableAlias}title,
    ${tableAlias}message,
    ${tableAlias}email_status,
    ${tableAlias}email_attempted_at,
    ${tableAlias}emailed_at,
    ${tableAlias}email_error,
    ${tableAlias}read_at,
    ${tableAlias}created_at
  `;
}

function buildTournamentNotificationCampaignFields(alias = "tnc") {
  const tableAlias = alias ? `${alias}.` : "";

  return `
    ${tableAlias}campaign_id,
    ${tableAlias}tournament_id,
    ${tableAlias}event_type,
    ${tableAlias}recipient_scope,
    ${tableAlias}title,
    ${tableAlias}message,
    ${tableAlias}send_email,
    ${tableAlias}created_by,
    ${tableAlias}created_at
  `;
}

function buildTournamentCommunityPostFields(alias = "tcp", linkedAlias = "lt") {
  const tableAlias = alias ? `${alias}.` : "";
  const linkedTableAlias = linkedAlias ? `${linkedAlias}.` : "";

  return `
    ${tableAlias}post_id,
    ${tableAlias}linked_tournament_id,
    ${tableAlias}content_type,
    ${tableAlias}status,
    ${tableAlias}accent_tone,
    ${tableAlias}title,
    ${tableAlias}subtitle,
    ${tableAlias}summary,
    ${tableAlias}body,
    ${tableAlias}badge_label,
    ${tableAlias}cta_label,
    ${tableAlias}priority,
    ${tableAlias}starts_at,
    ${tableAlias}ends_at,
    ${tableAlias}published_at,
    ${tableAlias}created_by,
    ${tableAlias}created_at,
    ${tableAlias}updated_at,
    CASE
      WHEN ${tableAlias}status = '${TOURNAMENT_COMMUNITY_POST_STATUS_PUBLISHED}'
      AND (${tableAlias}starts_at IS NULL OR ${tableAlias}starts_at <= NOW())
      AND (${tableAlias}ends_at IS NULL OR ${tableAlias}ends_at >= NOW())
      THEN 1
      ELSE 0
    END AS is_active_now,
    ${linkedTableAlias}tournament_id AS linked_tournament_tournament_id,
    ${linkedTableAlias}slug AS linked_tournament_slug,
    ${linkedTableAlias}title AS linked_tournament_title,
    ${linkedTableAlias}game_title AS linked_tournament_game_title,
    ${linkedTableAlias}status AS linked_tournament_status,
    ${linkedTableAlias}start_at AS linked_tournament_start_at,
    ${linkedTableAlias}is_featured AS linked_tournament_is_featured
  `;
}

async function getTournamentById(tournamentId) {
  const rows = await query(
    `
      SELECT ${buildTournamentSelectFields()}
      FROM tournaments
      WHERE tournament_id = ?
      LIMIT 1
    `,
    [tournamentId]
  );

  return rows[0] || null;
}

async function getTournamentCommunityPostById(postId, connection = null, { forUpdate = false } = {}) {
  const normalizedPostId = Number(postId || 0);
  if (!normalizedPostId) {
    return null;
  }

  const executor = connection
    ? async (sql, params) => {
        const [rows] = await connection.query(sql, params);
        return rows;
      }
    : query;

  const rows = await executor(
    `
      SELECT ${buildTournamentCommunityPostFields("tcp", "lt")}
      FROM tournament_community_posts tcp
      LEFT JOIN tournaments lt ON lt.tournament_id = tcp.linked_tournament_id
      WHERE tcp.post_id = ?
      LIMIT 1
      ${forUpdate ? "FOR UPDATE" : ""}
    `,
    [normalizedPostId]
  );

  return rows[0] || null;
}

async function getTournamentNotificationRecipients(
  connection,
  tournamentId,
  { includeCancelled = false } = {}
) {
  const [rows] = await connection.query(
    `
      SELECT
        tr.registration_id,
        tr.tournament_id,
        tr.user_id,
        tr.status,
        tr.attendance_status,
        tr.registration_type,
        tr.participant_name,
        tr.participant_email,
        tr.participant_mobile,
        tr.team_name,
        t.slug,
        t.title AS tournament_title,
        t.game_title,
        t.start_at,
        t.location_label
      FROM tournament_registrations tr
      JOIN tournaments t ON t.tournament_id = tr.tournament_id
      WHERE tr.tournament_id = ?
      ${
        includeCancelled
          ? ""
          : `AND tr.status IN ('${TOURNAMENT_REGISTRATION_STATUS_REGISTERED}', '${TOURNAMENT_REGISTRATION_STATUS_WAITLISTED}')`
      }
      ORDER BY tr.registration_id ASC
    `,
    [tournamentId]
  );

  return rows.map((row) => ({
    registration_id: Number(row.registration_id || 0),
    tournament_id: Number(row.tournament_id || 0),
    user_id: Number(row.user_id || 0),
    status: row.status || "",
    attendance_status: row.attendance_status || TOURNAMENT_ATTENDANCE_STATUS_PENDING,
    registration_type: row.registration_type || TOURNAMENT_REGISTRATION_TYPE_SOLO,
    participant_name: row.participant_name || "",
    participant_email: row.participant_email || "",
    participant_mobile: row.participant_mobile || "",
    team_name: row.team_name || "",
    slug: row.slug || "",
    tournament_title: row.tournament_title || "",
    game_title: row.game_title || "",
    start_at: row.start_at || null,
    location_label: row.location_label || "",
  }));
}

function dedupeTournamentNotificationRecipients(recipients) {
  const source = Array.isArray(recipients) ? recipients : [];
  const byUserId = new Map();

  for (const recipient of source) {
    const userId = Number(recipient?.user_id || 0);
    if (!userId || byUserId.has(userId)) {
      continue;
    }

    byUserId.set(userId, recipient);
  }

  return [...byUserId.values()];
}

function buildTournamentNotificationEmailMarkup({
  tournament,
  recipientName,
  title,
  message,
}) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";
  const details = [
    tournament?.game_title ? `${tournament.game_title}` : null,
    tournament?.start_at ? `Starts: ${new Date(tournament.start_at).toLocaleString("en-IN")}` : null,
    tournament?.location_label ? `Venue: ${tournament.location_label}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    text: [greeting, "", title, "", message, "", details].filter(Boolean).join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <p>${greeting}</p>
        <p style="font-size: 18px; font-weight: 700; margin: 0 0 12px;">${title}</p>
        <p style="margin: 0 0 16px;">${message}</p>
        ${
          details
            ? `<p style="margin: 0; color: #475569;"><strong>${tournament?.tournament_title || tournament?.title || "Tournament"}:</strong> ${details}</p>`
            : ""
        }
      </div>
    `,
  };
}

async function createTournamentNotificationCampaignWithDeliveries(
  connection,
  {
    tournamentId,
    eventType,
    recipientScope,
    title,
    message,
    createdBy = null,
    sendEmail = false,
    recipients = [],
    buildRecipientNotification = null,
  }
) {
  const normalizedTitle = String(title || "").trim().slice(0, 160);
  const normalizedMessage = String(message || "").trim();
  const normalizedScope = normalizeTournamentNotificationScope(recipientScope);
  const normalizedRecipients = dedupeTournamentNotificationRecipients(recipients);
  const emailConfigured = isMailConfigured();

  if (!normalizedTitle || !normalizedMessage || !normalizedRecipients.length) {
    return {
      campaign: null,
      notifications: [],
      emailJobs: [],
    };
  }

  const [campaignResult] = await connection.query(
    `
      INSERT INTO tournament_notification_campaigns (
        tournament_id,
        event_type,
        recipient_scope,
        title,
        message,
        send_email,
        created_by,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `,
    [
      tournamentId,
      eventType,
      normalizedScope,
      normalizedTitle,
      normalizedMessage,
      sendEmail ? 1 : 0,
      createdBy,
    ]
  );

  const campaignId = Number(campaignResult.insertId || 0);
  const notifications = [];
  const emailJobs = [];

  for (const recipient of normalizedRecipients) {
    const notificationPayload = typeof buildRecipientNotification === "function"
      ? buildRecipientNotification(recipient) || {}
      : {};
    const notificationTitle = String(notificationPayload.title || normalizedTitle)
      .trim()
      .slice(0, 160);
    const notificationMessage = String(notificationPayload.message || normalizedMessage).trim();
    const emailStatus =
      sendEmail && emailConfigured && String(recipient.participant_email || "").trim()
        ? TOURNAMENT_NOTIFICATION_EMAIL_STATUS_PENDING
        : TOURNAMENT_NOTIFICATION_EMAIL_STATUS_SKIPPED;
    const [result] = await connection.query(
      `
        INSERT INTO tournament_notifications (
          campaign_id,
          tournament_id,
          registration_id,
          user_id,
          event_type,
          title,
          message,
          email_status,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        campaignId,
        tournamentId,
        recipient.registration_id || null,
        recipient.user_id,
        eventType,
        notificationTitle,
        notificationMessage,
        emailStatus,
      ]
    );

    const notificationId = Number(result.insertId || 0);
    notifications.push({
      notification_id: notificationId,
      campaign_id: campaignId,
      tournament_id: tournamentId,
      registration_id: recipient.registration_id || null,
      user_id: recipient.user_id,
      event_type: eventType,
      title: notificationTitle,
      message: notificationMessage,
      email_status: emailStatus,
      created_at: new Date(),
    });

    const normalizedEventType = String(eventType || "update").toLowerCase();
    const isWaitlistEvent = /waitlist|promot|movement/.test(normalizedEventType);
    await createCustomerNotification(connection, {
      userId: recipient.user_id,
      category: isWaitlistEvent ? "waitlist" : "tournaments",
      eventType: normalizedEventType,
      title: notificationTitle,
      message: notificationMessage,
      deepLink: `/tournaments/${Number(tournamentId)}`,
      entityType: "tournament",
      entityId: tournamentId,
      idempotencyKey: `tournament-campaign:${campaignId}:${Number(recipient.user_id)}`,
    });

    if (emailStatus === TOURNAMENT_NOTIFICATION_EMAIL_STATUS_PENDING) {
      emailJobs.push({
        notificationId,
        to: recipient.participant_email,
        participantName: recipient.participant_name,
        title: notificationTitle,
        message: notificationMessage,
        tournament: recipient,
      });
    }
  }

  return {
    campaign: serializeTournamentNotificationCampaign({
      campaign_id: campaignId,
      tournament_id: tournamentId,
      event_type: eventType,
      recipient_scope: normalizedScope,
      title: normalizedTitle,
      message: normalizedMessage,
      send_email: sendEmail ? 1 : 0,
      created_by: createdBy,
      created_at: new Date(),
      delivery_count: notifications.length,
      read_count: 0,
      emailed_count: 0,
      email_failed_count: 0,
    }),
    notifications: notifications.map(serializeTournamentNotification),
    emailJobs,
  };
}

async function dispatchTournamentNotificationEmails(emailJobs = []) {
  for (const job of emailJobs) {
    try {
      await query(
        `
          UPDATE tournament_notifications
          SET
            email_attempted_at = NOW()
          WHERE notification_id = ?
        `,
        [job.notificationId]
      );
    } catch (_) {
      // Ignore bookkeeping failures before send so the message can still be attempted.
    }

    try {
      const mailCopy = buildTournamentNotificationEmailMarkup({
        tournament: job.tournament,
        recipientName: job.participantName,
        title: job.title,
        message: job.message,
      });

      await sendMail({
        to: job.to,
        subject: job.title,
        text: mailCopy.text,
        html: mailCopy.html,
      });

      await query(
        `
          UPDATE tournament_notifications
          SET
            email_status = ?,
            emailed_at = NOW(),
            email_error = NULL
          WHERE notification_id = ?
        `,
        [TOURNAMENT_NOTIFICATION_EMAIL_STATUS_SENT, job.notificationId]
      );
    } catch (error) {
      await query(
        `
          UPDATE tournament_notifications
          SET
            email_status = ?,
            email_error = ?,
            email_attempted_at = COALESCE(email_attempted_at, NOW())
          WHERE notification_id = ?
        `,
        [
          TOURNAMENT_NOTIFICATION_EMAIL_STATUS_FAILED,
          String(error?.message || "Email delivery failed.").slice(0, 255),
          job.notificationId,
        ]
      );
    }
  }
}

async function buildUniqueSlug(connection, desiredSlug, excludeTournamentId = null) {
  const baseSlug = slugifyTournamentTitle(desiredSlug || "tournament");
  let candidate = baseSlug;
  let counter = 2;

  while (true) {
    const params = [candidate];
    let whereClause = "slug = ?";

    if (excludeTournamentId) {
      whereClause += " AND tournament_id <> ?";
      params.push(excludeTournamentId);
    }

    const [rows] = await connection.query(
      `
        SELECT tournament_id
        FROM tournaments
        WHERE ${whereClause}
        LIMIT 1
      `,
      params
    );

    if (!rows.length) {
      return candidate;
    }

    candidate = `${baseSlug.slice(0, 170)}-${counter}`;
    counter += 1;
  }
}

async function syncTournamentRegisteredCount(connection, tournamentId) {
  await connection.query(
    `
      UPDATE tournaments
      SET
        registered_count = (
          SELECT COUNT(*)
          FROM tournament_registrations
          WHERE tournament_id = ?
          AND status = ?
        ),
        updated_at = NOW()
      WHERE tournament_id = ?
    `,
    [tournamentId, TOURNAMENT_REGISTRATION_STATUS_REGISTERED, tournamentId]
  );
}

async function getTournamentRegistration(connection, tournamentId, userId) {
  const [rows] = await connection.query(
    `
      SELECT *
      FROM tournament_registrations
      WHERE tournament_id = ?
      AND user_id = ?
      LIMIT 1
    `,
    [tournamentId, userId]
  );

  return rows[0] || null;
}

function getAuthenticatedUserId(req) {
  return Number(req.user?.id || 0);
}

function buildTournamentNotificationRecipientsFromRegistrations(
  tournament,
  registrations = []
) {
  return (Array.isArray(registrations) ? registrations : []).map((registration) => ({
    registration_id: Number(registration.registration_id || 0),
    tournament_id: Number(tournament?.tournament_id || 0),
    user_id: Number(registration.user_id || 0),
    status: registration.status || registration.registration_status || "",
    attendance_status: registration.attendance_status || TOURNAMENT_ATTENDANCE_STATUS_PENDING,
    registration_type: registration.registration_type || TOURNAMENT_REGISTRATION_TYPE_SOLO,
    participant_name: registration.participant_name || "",
    participant_email: registration.participant_email || "",
    participant_mobile: registration.participant_mobile || "",
    team_name: registration.team_name || "",
    slug: tournament?.slug || "",
    tournament_title: tournament?.title || "",
    game_title: tournament?.game_title || "",
    start_at: tournament?.start_at || null,
    location_label: tournament?.location_label || "",
  }));
}

module.exports = {
  buildAdminOrderSql,
  buildPublicOrderSql,
  buildTournamentCommunityPostFields,
  buildTournamentNotificationCampaignFields,
  buildTournamentNotificationEmailMarkup,
  buildTournamentNotificationFields,
  buildTournamentNotificationRecipientsFromRegistrations,
  buildTournamentRegistrationPaymentProjection,
  buildTournamentRegistrationProjection,
  buildTournamentSelectFields,
  buildUniqueSlug,
  createTournamentNotificationCampaignWithDeliveries,
  dedupeTournamentNotificationRecipients,
  dispatchTournamentNotificationEmails,
  getAuthenticatedUserId,
  getTournamentById,
  getTournamentCommunityPostById,
  getTournamentNotificationRecipients,
  getTournamentRegistration,
  isInlineImageData,
  shouldDeleteStoredCoverImage,
  syncTournamentRegisteredCount,
};
