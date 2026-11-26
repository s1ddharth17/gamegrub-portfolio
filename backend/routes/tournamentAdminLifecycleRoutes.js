const adminAuth = require("../middleware/adminAuth");
const { ADMIN_PERMISSIONS } = require("../utils/adminAccess");
const { withTransaction } = require("../utils/db");
const { deleteStoredFile } = require("../utils/uploadStorage");
const {
  TOURNAMENT_NOTIFICATION_EVENT_CANCELLED,
  TOURNAMENT_NOTIFICATION_EVENT_PUBLISHED,
  TOURNAMENT_NOTIFICATION_SCOPE_ALL_REGISTERED,
  filterTournamentNotificationRecipients,
} = require("../utils/tournamentNotifications");
const {
  TOURNAMENT_STATUS_CANCELLED,
  TOURNAMENT_STATUS_PUBLISHED,
  parseTournamentInput,
  serializeTournament,
} = require("../utils/tournaments");
const {
  buildTournamentSelectFields,
  buildUniqueSlug,
  createTournamentNotificationCampaignWithDeliveries,
  dispatchTournamentNotificationEmails,
  getTournamentById,
  getTournamentNotificationRecipients,
  shouldDeleteStoredCoverImage,
} = require("./tournamentRouteSupport");
const {
  requestTournamentCancellationRefunds,
} = require("./tournamentRegistrationSupport");

function getAdminActorId(req) {
  return Number(req.admin?.id || 0) || null;
}

function sameScheduleValue(left, right) {
  if (left == null || right == null || left === "" || right === "") {
    return (left == null || left === "") && (right == null || right === "");
  }
  const leftTime = new Date(left).getTime();
  const rightTime = new Date(right).getTime();
  return Number.isFinite(leftTime) && Number.isFinite(rightTime)
    ? leftTime === rightTime
    : String(left) === String(right);
}

async function getTournamentRow(connection, tournamentId, { forUpdate = false } = {}) {
  const [rows] = await connection.query(
    `
      SELECT ${buildTournamentSelectFields()}
      FROM tournaments
      WHERE tournament_id = ?
      LIMIT 1
      ${forUpdate ? "FOR UPDATE" : ""}
    `,
    [tournamentId]
  );

  return rows[0] || null;
}

function registerTournamentAdminLifecycleRoutes(router) {
  router.post(
    "/admin/create",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      const parsed = parseTournamentInput(req.body, { partial: false });

      if (parsed.errors.length) {
        return res.status(400).json({ error: parsed.errors.join(" ") });
      }

      try {
        const tournament = await withTransaction(async (connection) => {
          const slug = await buildUniqueSlug(connection, parsed.data.slug || parsed.data.title);

          const [result] = await connection.query(
            `
              INSERT INTO tournaments (
                slug,
                title,
                game_title,
                skill_level,
                format,
                team_size,
                max_participants,
                registered_count,
                entry_fee,
                prize_pool,
                is_sponsored,
                sponsor_name,
                sponsor_tagline,
                sponsor_prize_contribution,
                is_premium,
                premium_entry_fee,
                premium_label,
                premium_perks,
                refund_policy,
                refund_cutoff_hours,
                refund_percentage,
                location_label,
                summary,
                description,
                rules,
                cover_image,
                status,
                is_featured,
                start_at,
                end_at,
                registration_open_at,
                registration_close_at,
                published_at,
                created_by,
                updated_by,
                created_at,
                updated_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `,
            [
              slug,
              parsed.data.title,
              parsed.data.game_title,
              parsed.data.skill_level,
              parsed.data.format,
              parsed.data.team_size,
              parsed.data.max_participants,
              parsed.data.registered_count || 0,
              parsed.data.entry_fee,
              parsed.data.prize_pool,
              parsed.data.is_sponsored ? 1 : 0,
              parsed.data.sponsor_name || null,
              parsed.data.sponsor_tagline || null,
              parsed.data.sponsor_prize_contribution,
              parsed.data.is_premium ? 1 : 0,
              parsed.data.premium_entry_fee,
              parsed.data.premium_label || null,
              parsed.data.premium_perks || null,
              parsed.data.refund_policy,
              parsed.data.refund_cutoff_hours,
              parsed.data.refund_percentage,
              parsed.data.location_label,
              parsed.data.summary,
              parsed.data.description,
              parsed.data.rules,
              parsed.data.cover_image || null,
              parsed.data.status,
              parsed.data.is_featured ? 1 : 0,
              parsed.data.start_at,
              parsed.data.end_at,
              parsed.data.registration_open_at,
              parsed.data.registration_close_at,
              parsed.data.status === TOURNAMENT_STATUS_PUBLISHED ? new Date() : null,
              getAdminActorId(req),
              getAdminActorId(req),
            ]
          );

          return getTournamentRow(connection, result.insertId);
        });

        return res.json({
          message: "Tournament created.",
          tournament: serializeTournament(tournament),
        });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }
  );

  router.put(
    "/admin/update/:id",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      const tournamentId = Number(req.params.id || 0);

      if (!tournamentId) {
        return res.status(400).json({ error: "Tournament id is required." });
      }

      try {
        const existing = await getTournamentById(tournamentId);

        if (!existing) {
          return res.status(404).json({ error: "Tournament not found." });
        }

        const parsed = parseTournamentInput(req.body, { partial: true, current: existing });
        if (parsed.errors.length) {
          return res.status(400).json({ error: parsed.errors.join(" ") });
        }

        const tournament = await withTransaction(async (connection) => {
          const nextTitle = parsed.data.title || existing.title;
          const nextCoverImage =
            parsed.data.cover_image !== undefined
              ? parsed.data.cover_image || null
              : existing.cover_image;
          const desiredSlug =
            parsed.data.slug ||
            (parsed.data.title && parsed.data.title !== existing.title
              ? nextTitle
              : existing.slug);
          const slug = await buildUniqueSlug(connection, desiredSlug, tournamentId);
          const nextStatus = parsed.data.status || existing.status;
          const shouldSetPublishedAt =
            nextStatus === TOURNAMENT_STATUS_PUBLISHED && !existing.published_at;

          await connection.query(
            `
              UPDATE tournaments
              SET
                slug = ?,
                title = ?,
                game_title = ?,
                skill_level = ?,
                format = ?,
                team_size = ?,
                max_participants = ?,
                registered_count = ?,
                entry_fee = ?,
                prize_pool = ?,
                is_sponsored = ?,
                sponsor_name = ?,
                sponsor_tagline = ?,
                sponsor_prize_contribution = ?,
                is_premium = ?,
                premium_entry_fee = ?,
                premium_label = ?,
                premium_perks = ?,
                refund_policy = ?,
                refund_cutoff_hours = ?,
                refund_percentage = ?,
                location_label = ?,
                summary = ?,
                description = ?,
                rules = ?,
                cover_image = ?,
                status = ?,
                is_featured = ?,
                start_at = ?,
                end_at = ?,
                registration_open_at = ?,
                registration_close_at = ?,
                published_at = CASE
                  WHEN ? THEN NOW()
                  ELSE published_at
                END,
                updated_by = ?,
                updated_at = NOW()
              WHERE tournament_id = ?
            `,
            [
              slug,
              parsed.data.title || existing.title,
              parsed.data.game_title || existing.game_title,
              parsed.data.skill_level || existing.skill_level || "open",
              parsed.data.format || existing.format,
              parsed.data.team_size || existing.team_size,
              parsed.data.max_participants || existing.max_participants,
              parsed.data.registered_count !== undefined
                ? parsed.data.registered_count
                : existing.registered_count,
              parsed.data.entry_fee !== undefined ? parsed.data.entry_fee : existing.entry_fee,
              parsed.data.prize_pool !== undefined
                ? parsed.data.prize_pool
                : existing.prize_pool,
              parsed.data.is_sponsored !== undefined
                ? parsed.data.is_sponsored
                  ? 1
                  : 0
                : existing.is_sponsored,
              parsed.data.sponsor_name !== undefined
                ? parsed.data.sponsor_name || null
                : existing.sponsor_name,
              parsed.data.sponsor_tagline !== undefined
                ? parsed.data.sponsor_tagline || null
                : existing.sponsor_tagline,
              parsed.data.sponsor_prize_contribution !== undefined
                ? parsed.data.sponsor_prize_contribution
                : existing.sponsor_prize_contribution,
              parsed.data.is_premium !== undefined
                ? parsed.data.is_premium
                  ? 1
                  : 0
                : existing.is_premium,
              parsed.data.premium_entry_fee !== undefined
                ? parsed.data.premium_entry_fee
                : existing.premium_entry_fee,
              parsed.data.premium_label !== undefined
                ? parsed.data.premium_label || null
                : existing.premium_label,
              parsed.data.premium_perks !== undefined
                ? parsed.data.premium_perks || null
                : existing.premium_perks,
              parsed.data.refund_policy || existing.refund_policy,
              parsed.data.refund_cutoff_hours !== undefined
                ? parsed.data.refund_cutoff_hours
                : existing.refund_cutoff_hours,
              parsed.data.refund_percentage !== undefined
                ? parsed.data.refund_percentage
                : existing.refund_percentage,
              parsed.data.location_label !== undefined
                ? parsed.data.location_label
                : existing.location_label,
              parsed.data.summary !== undefined ? parsed.data.summary : existing.summary,
              parsed.data.description !== undefined ? parsed.data.description : existing.description,
              parsed.data.rules !== undefined ? parsed.data.rules : existing.rules,
              nextCoverImage,
              nextStatus,
              parsed.data.is_featured !== undefined
                ? parsed.data.is_featured
                  ? 1
                  : 0
                : existing.is_featured,
              parsed.data.start_at || existing.start_at,
              parsed.data.end_at !== undefined ? parsed.data.end_at : existing.end_at,
              parsed.data.registration_open_at !== undefined
                ? parsed.data.registration_open_at
                : existing.registration_open_at,
              parsed.data.registration_close_at !== undefined
                ? parsed.data.registration_close_at
                : existing.registration_close_at,
              shouldSetPublishedAt,
              getAdminActorId(req),
              tournamentId,
            ]
          );

          const updatedTournament = await getTournamentRow(connection, tournamentId);
          let notificationBatch = { emailJobs: [] };
          let refundNotificationBatch = { emailJobs: [] };

          if (nextStatus !== existing.status) {
            if (nextStatus === TOURNAMENT_STATUS_PUBLISHED) {
              notificationBatch = await createTournamentNotificationCampaignWithDeliveries(
                connection,
                {
                  tournamentId,
                  eventType: TOURNAMENT_NOTIFICATION_EVENT_PUBLISHED,
                  recipientScope: TOURNAMENT_NOTIFICATION_SCOPE_ALL_REGISTERED,
                  title: `${updatedTournament?.title || nextTitle} is now live`,
                  message:
                    "The tournament has been published. Review the event details, timings, and rules in the app before registration closes.",
                  createdBy: getAdminActorId(req),
                  sendEmail: true,
                  recipients: filterTournamentNotificationRecipients(
                    await getTournamentNotificationRecipients(connection, tournamentId),
                    TOURNAMENT_NOTIFICATION_SCOPE_ALL_REGISTERED
                  ),
                }
              );
            } else if (nextStatus === TOURNAMENT_STATUS_CANCELLED) {
              const cancellationRefunds = await requestTournamentCancellationRefunds(
                connection,
                updatedTournament || { ...existing, status: nextStatus },
                {
                  notes:
                    "Tournament was cancelled and eligible captured entry fees were moved into refund review.",
                }
              );
              refundNotificationBatch = cancellationRefunds.notificationBatch;

              notificationBatch = await createTournamentNotificationCampaignWithDeliveries(
                connection,
                {
                  tournamentId,
                  eventType: TOURNAMENT_NOTIFICATION_EVENT_CANCELLED,
                  recipientScope: TOURNAMENT_NOTIFICATION_SCOPE_ALL_REGISTERED,
                  title: `${updatedTournament?.title || nextTitle} has been cancelled`,
                  message:
                    "This tournament is no longer going ahead as scheduled. Check the admin update feed for any follow-up instructions or replacement events.",
                  createdBy: getAdminActorId(req),
                  sendEmail: true,
                  recipients: await getTournamentNotificationRecipients(connection, tournamentId),
                }
              );
            }
          }

          const scheduleChanged =
            !sameScheduleValue(existing.start_at, updatedTournament?.start_at) ||
            !sameScheduleValue(existing.end_at, updatedTournament?.end_at) ||
            String(existing.location_label || "") !== String(updatedTournament?.location_label || "");
          if (
            existing.status === TOURNAMENT_STATUS_PUBLISHED &&
            nextStatus === TOURNAMENT_STATUS_PUBLISHED &&
            scheduleChanged
          ) {
            const recipients = filterTournamentNotificationRecipients(
              await getTournamentNotificationRecipients(connection, tournamentId),
              TOURNAMENT_NOTIFICATION_SCOPE_ALL_REGISTERED
            );
            notificationBatch = await createTournamentNotificationCampaignWithDeliveries(
              connection,
              {
                tournamentId,
                eventType: "schedule_changed",
                recipientScope: TOURNAMENT_NOTIFICATION_SCOPE_ALL_REGISTERED,
                title: `${updatedTournament?.title || nextTitle} schedule updated`,
                message: "The tournament schedule or venue has changed. Review the latest event details in the app and re-export your calendar entry to refresh its reminders.",
                createdBy: getAdminActorId(req),
                recipients,
              }
            );
          }

          return {
            tournament: updatedTournament,
            previousCoverImage: existing.cover_image || null,
            nextCoverImage,
            emailJobs: [
              ...notificationBatch.emailJobs,
              ...refundNotificationBatch.emailJobs,
            ],
          };
        });

        await dispatchTournamentNotificationEmails(tournament.emailJobs);

        if (
          tournament.previousCoverImage &&
          tournament.previousCoverImage !== tournament.nextCoverImage &&
          shouldDeleteStoredCoverImage(tournament.previousCoverImage)
        ) {
          try {
            await deleteStoredFile(tournament.previousCoverImage);
          } catch (cleanupError) {
            console.warn(
              "Failed to clean up previous tournament cover image:",
              cleanupError
            );
          }
        }

        return res.json({
          message: "Tournament updated.",
          tournament: serializeTournament(tournament.tournament),
        });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }
  );

  router.post(
    "/admin/publish/:id",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      const tournamentId = Number(req.params.id || 0);

      if (!tournamentId) {
        return res.status(400).json({ error: "Tournament id is required." });
      }

      try {
        const result = await withTransaction(async (connection) => {
          const tournament = await getTournamentRow(connection, tournamentId, { forUpdate: true });

          if (!tournament) {
            const error = new Error("Tournament not found.");
            error.statusCode = 404;
            throw error;
          }

          await connection.query(
            `
              UPDATE tournaments
              SET
                status = ?,
                published_at = COALESCE(published_at, NOW()),
                updated_by = ?,
                updated_at = NOW()
              WHERE tournament_id = ?
            `,
            [TOURNAMENT_STATUS_PUBLISHED, getAdminActorId(req), tournamentId]
          );

          const updatedTournament = await getTournamentRow(connection, tournamentId);
          const notificationBatch = await createTournamentNotificationCampaignWithDeliveries(
            connection,
            {
              tournamentId,
              eventType: TOURNAMENT_NOTIFICATION_EVENT_PUBLISHED,
              recipientScope: TOURNAMENT_NOTIFICATION_SCOPE_ALL_REGISTERED,
              title: `${updatedTournament?.title || tournament.title} is now live`,
              message:
                "The tournament has been published. Review the event details, timings, and rules in the app before registration closes.",
              createdBy: getAdminActorId(req),
              sendEmail: true,
              recipients: filterTournamentNotificationRecipients(
                await getTournamentNotificationRecipients(connection, tournamentId),
                TOURNAMENT_NOTIFICATION_SCOPE_ALL_REGISTERED
              ),
            }
          );

          return {
            tournament: updatedTournament,
            emailJobs: notificationBatch.emailJobs,
          };
        });

        await dispatchTournamentNotificationEmails(result.emailJobs);

        return res.json({
          message: "Tournament published.",
          tournament: serializeTournament(result.tournament),
        });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  router.post(
    "/admin/cancel/:id",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      const tournamentId = Number(req.params.id || 0);

      if (!tournamentId) {
        return res.status(400).json({ error: "Tournament id is required." });
      }

      try {
        const result = await withTransaction(async (connection) => {
          const tournament = await getTournamentRow(connection, tournamentId, { forUpdate: true });

          if (!tournament) {
            const error = new Error("Tournament not found.");
            error.statusCode = 404;
            throw error;
          }

          await connection.query(
            `
              UPDATE tournaments
              SET
                status = ?,
                updated_by = ?,
                updated_at = NOW()
              WHERE tournament_id = ?
            `,
            [TOURNAMENT_STATUS_CANCELLED, getAdminActorId(req), tournamentId]
          );

          const updatedTournament = await getTournamentRow(connection, tournamentId);
          const cancellationRefunds =
            String(tournament.status || "").trim().toLowerCase() === TOURNAMENT_STATUS_CANCELLED
              ? { notificationBatch: { emailJobs: [] } }
              : await requestTournamentCancellationRefunds(
                  connection,
                  updatedTournament || { ...tournament, status: TOURNAMENT_STATUS_CANCELLED },
                  {
                    notes:
                      "Tournament was cancelled and eligible captured entry fees were moved into refund review.",
                  }
                );
          const notificationBatch = await createTournamentNotificationCampaignWithDeliveries(
            connection,
            {
              tournamentId,
              eventType: TOURNAMENT_NOTIFICATION_EVENT_CANCELLED,
              recipientScope: TOURNAMENT_NOTIFICATION_SCOPE_ALL_REGISTERED,
              title: `${updatedTournament?.title || tournament.title} has been cancelled`,
              message:
                "This tournament is no longer going ahead as scheduled. Check the admin update feed for any follow-up instructions or replacement events.",
              createdBy: getAdminActorId(req),
              sendEmail: true,
              recipients: await getTournamentNotificationRecipients(connection, tournamentId),
            }
          );

          return {
            tournament: updatedTournament,
            emailJobs: [
              ...notificationBatch.emailJobs,
              ...cancellationRefunds.notificationBatch.emailJobs,
            ],
          };
        });

        await dispatchTournamentNotificationEmails(result.emailJobs);

        return res.json({
          message: "Tournament cancelled.",
          tournament: serializeTournament(result.tournament),
        });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );
}

module.exports = {
  registerTournamentAdminLifecycleRoutes,
};
