const auth = require("../middleware/auth");
const adminAuth = require("../middleware/adminAuth");
const { ADMIN_PERMISSIONS } = require("../utils/adminAccess");
const { query, withTransaction } = require("../utils/db");
const { isMailConfigured } = require("../utils/mailer");
const {
  TOURNAMENT_NOTIFICATION_EMAIL_STATUS_FAILED,
  TOURNAMENT_NOTIFICATION_EMAIL_STATUS_SENT,
  TOURNAMENT_NOTIFICATION_EVENT_ANNOUNCEMENT,
  TOURNAMENT_NOTIFICATION_SCOPES,
  filterTournamentNotificationRecipients,
  serializeTournamentNotification,
  serializeTournamentNotificationCampaign,
} = require("../utils/tournamentNotifications");
const { serializeTournament } = require("../utils/tournaments");
const {
  buildTournamentNotificationCampaignFields,
  buildTournamentNotificationFields,
  buildTournamentSelectFields,
  createTournamentNotificationCampaignWithDeliveries,
  dispatchTournamentNotificationEmails,
  getAuthenticatedUserId,
  getTournamentById,
  getTournamentNotificationRecipients,
} = require("./tournamentRouteSupport");

function registerTournamentNotificationRoutes(router) {
  router.get("/notifications", auth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const tournamentId = Number(req.query?.tournament_id || 0);
    const unreadOnly = String(req.query?.unread_only || "").trim().toLowerCase() === "true";

    if (!userId) {
      return res.status(401).json({ error: "User token required." });
    }

    try {
      const params = [userId];
      let filters = "WHERE tn.user_id = ?";

      if (tournamentId) {
        filters += " AND tn.tournament_id = ?";
        params.push(tournamentId);
      }

      if (unreadOnly) {
        filters += " AND tn.read_at IS NULL";
      }

      const rows = await query(
        `
          SELECT
            ${buildTournamentNotificationFields("tn")},
            t.slug,
            t.title AS tournament_title,
            t.game_title,
            t.status AS tournament_status,
            t.start_at
          FROM tournament_notifications tn
          JOIN tournaments t ON t.tournament_id = tn.tournament_id
          ${filters}
          ORDER BY tn.created_at DESC, tn.notification_id DESC
          LIMIT 100
        `,
        params
      );

      return res.json(rows.map(serializeTournamentNotification));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.post("/notifications/:notificationId/read", auth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const notificationId = Number(req.params.notificationId || 0);

    if (!userId) {
      return res.status(401).json({ error: "User token required." });
    }

    if (!notificationId) {
      return res.status(400).json({ error: "Notification id is required." });
    }

    try {
      await query(
        `
          UPDATE tournament_notifications
          SET read_at = COALESCE(read_at, NOW())
          WHERE notification_id = ?
          AND user_id = ?
        `,
        [notificationId, userId]
      );

      const rows = await query(
        `
          SELECT
            ${buildTournamentNotificationFields("tn")},
            t.slug,
            t.title AS tournament_title,
            t.game_title,
            t.status AS tournament_status,
            t.start_at
          FROM tournament_notifications tn
          JOIN tournaments t ON t.tournament_id = tn.tournament_id
          WHERE tn.notification_id = ?
          AND tn.user_id = ?
          LIMIT 1
        `,
        [notificationId, userId]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "Notification not found." });
      }

      return res.json({
        message: "Notification marked as read.",
        notification: serializeTournamentNotification(rows[0]),
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get(
    "/admin/:id/notifications",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      const tournamentId = Number(req.params.id || 0);

      if (!tournamentId) {
        return res.status(400).json({ error: "Tournament id is required." });
      }

      try {
        const tournament = await getTournamentById(tournamentId);
        if (!tournament) {
          return res.status(404).json({ error: "Tournament not found." });
        }

        const rows = await query(
          `
            SELECT
              ${buildTournamentNotificationCampaignFields("tnc")},
              COUNT(tn.notification_id) AS delivery_count,
              SUM(CASE WHEN tn.read_at IS NOT NULL THEN 1 ELSE 0 END) AS read_count,
              SUM(CASE WHEN tn.email_status = '${TOURNAMENT_NOTIFICATION_EMAIL_STATUS_SENT}' THEN 1 ELSE 0 END) AS emailed_count,
              SUM(CASE WHEN tn.email_status = '${TOURNAMENT_NOTIFICATION_EMAIL_STATUS_FAILED}' THEN 1 ELSE 0 END) AS email_failed_count
            FROM tournament_notification_campaigns tnc
            LEFT JOIN tournament_notifications tn
              ON tn.campaign_id = tnc.campaign_id
            WHERE tnc.tournament_id = ?
            GROUP BY
              tnc.campaign_id,
              tnc.tournament_id,
              tnc.event_type,
              tnc.recipient_scope,
              tnc.title,
              tnc.message,
              tnc.send_email,
              tnc.created_by,
              tnc.created_at
            ORDER BY tnc.created_at DESC, tnc.campaign_id DESC
            LIMIT 50
          `,
          [tournamentId]
        );

        return res.json({
          tournament: serializeTournament(tournament),
          campaigns: rows.map(serializeTournamentNotificationCampaign),
          mail_delivery_available: isMailConfigured(),
        });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }
  );

  router.post(
    "/admin/:id/notifications",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      const tournamentId = Number(req.params.id || 0);
      const title = String(req.body?.title || "").trim();
      const message = String(req.body?.message || "").trim();
      const requestedScope = String(req.body?.recipient_scope || "").trim().toLowerCase();
      const sendEmail = ["true", "1", "yes"].includes(
        String(req.body?.send_email || "").trim().toLowerCase()
      );

      if (!tournamentId) {
        return res.status(400).json({ error: "Tournament id is required." });
      }

      if (!title) {
        return res.status(400).json({ error: "Notification title is required." });
      }

      if (!message) {
        return res.status(400).json({ error: "Notification message is required." });
      }

      if (!TOURNAMENT_NOTIFICATION_SCOPES.has(requestedScope)) {
        return res.status(400).json({ error: "A valid recipient scope is required." });
      }

      try {
        const result = await withTransaction(async (connection) => {
          const [tournamentRows] = await connection.query(
            `
              SELECT ${buildTournamentSelectFields()}
              FROM tournaments
              WHERE tournament_id = ?
              LIMIT 1
              FOR UPDATE
            `,
            [tournamentId]
          );

          const tournament = tournamentRows[0];
          if (!tournament) {
            const error = new Error("Tournament not found.");
            error.statusCode = 404;
            throw error;
          }

          const recipients = filterTournamentNotificationRecipients(
            await getTournamentNotificationRecipients(connection, tournamentId),
            requestedScope
          );

          const notificationBatch = await createTournamentNotificationCampaignWithDeliveries(
            connection,
            {
              tournamentId,
              eventType: TOURNAMENT_NOTIFICATION_EVENT_ANNOUNCEMENT,
              recipientScope: requestedScope,
              title,
              message,
              createdBy: Number(req.admin?.id || 0) || null,
              sendEmail,
              recipients,
            }
          );

          return {
            tournament,
            ...notificationBatch,
          };
        });

        await dispatchTournamentNotificationEmails(result.emailJobs);

        return res.json({
          message: "Tournament update sent.",
          tournament: serializeTournament(result.tournament),
          campaign: result.campaign,
          notifications_created: result.notifications.length,
          mail_delivery_available: isMailConfigured(),
        });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );
}

module.exports = {
  registerTournamentNotificationRoutes,
};
