const auth = require("../middleware/auth");
const { withTransaction } = require("../utils/db");
const {
  TOURNAMENT_NOTIFICATION_EVENT_WAITLIST_JOINED,
  TOURNAMENT_NOTIFICATION_SCOPE_WAITLISTED,
} = require("../utils/tournamentNotifications");
const {
  TOURNAMENT_ATTENDANCE_STATUS_PENDING,
  TOURNAMENT_FORMAT_SOLO,
  TOURNAMENT_REGISTRATION_STATUS_CANCELLED,
  TOURNAMENT_REGISTRATION_STATUS_REGISTERED,
  TOURNAMENT_REGISTRATION_STATUS_WAITLISTED,
  TOURNAMENT_REGISTRATION_TYPE_SOLO,
  TOURNAMENT_REGISTRATION_TYPE_TEAM,
  canWithdrawTournamentRegistration,
  normalizeBooleanFlag,
  normalizeTournamentRegistrationStatus,
  serializeTournament,
} = require("../utils/tournaments");
const { buildTournamentRegistrationCharge } = require("../utils/tournamentPayments");
const {
  buildTournamentNotificationRecipientsFromRegistrations,
  buildTournamentRegistrationProjection,
  buildTournamentSelectFields,
  createTournamentNotificationCampaignWithDeliveries,
  dispatchTournamentNotificationEmails,
  getAuthenticatedUserId,
  getTournamentRegistration,
  syncTournamentRegisteredCount,
} = require("./tournamentRouteSupport");
const { resetTournamentBracketIfEditable } = require("./tournamentBracketPersistenceSupport");
const { getOwnedTournamentTeam } = require("./tournamentTeamSupport");
const {
  attachRegistrationRelations,
  buildRegistrationMembers,
  buildRegistrationMembersFromSavedTeam,
  createTournamentRegistrationPaymentNotifications,
  createWaitlistPromotionNotifications,
  ensureTournamentRegistrationPaymentRecord,
  formatTournamentPaymentAmount,
  hydrateTournamentRegistrations,
  markTournamentRegistrationPaid,
  promoteTournamentWaitlistIfPossible,
  replaceTournamentRegistrationMembers,
  requestTournamentRegistrationRefundIfEligible,
  syncTournamentOperationsStageForRegistrationChanges,
} = require("./tournamentRegistrationSupport");

function registerTournamentParticipantRoutes(router) {
  router.post("/register", auth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const tournamentId = Number(req.body?.tournament_id || 0);
    const teamId = Number(req.body?.team_id || 0);
    const teamName = String(req.body?.team_name || "").trim();
    const rosterInput = Array.isArray(req.body?.roster) ? req.body.roster : [];
    const premiumAccess = normalizeBooleanFlag(req.body?.premium_access, false);
    const paymentMethod = String(req.body?.payment_method || "").trim();
    const paymentReference = String(req.body?.payment_reference || "").trim();
    const paymentNotes = String(req.body?.payment_notes || "").trim();

    if (!userId) {
      return res.status(401).json({ error: "User token required." });
    }

    if (!tournamentId) {
      return res.status(400).json({ error: "Tournament id is required." });
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

        const currentTournament = tournamentRows[0];

        if (!currentTournament) {
          const error = new Error("Tournament not found.");
          error.statusCode = 404;
          throw error;
        }

        const serializedTournament = serializeTournament(currentTournament);
        if (!serializedTournament.can_register && !serializedTournament.can_join_waitlist) {
          const error = new Error("Registration is not open for this tournament.");
          error.statusCode = 400;
          throw error;
        }

        const nextRegistrationStatus = serializedTournament.can_register
          ? TOURNAMENT_REGISTRATION_STATUS_REGISTERED
          : TOURNAMENT_REGISTRATION_STATUS_WAITLISTED;
        const registrationCharge = buildTournamentRegistrationCharge({
          tournament: currentTournament,
          premiumAccess,
        });

        if (premiumAccess && !normalizeBooleanFlag(currentTournament.is_premium, false)) {
          const error = new Error("This tournament does not offer premium access.");
          error.statusCode = 400;
          throw error;
        }

        if (premiumAccess && Number(registrationCharge.premium_access_fee || 0) <= 0) {
          const error = new Error(
            "Premium access is not available until the tournament premium add-on is configured."
          );
          error.statusCode = 400;
          throw error;
        }

        if (
          nextRegistrationStatus === TOURNAMENT_REGISTRATION_STATUS_WAITLISTED &&
          (paymentMethod || paymentReference || paymentNotes)
        ) {
          const error = new Error(
            "Waitlist entries cannot be marked as paid until an active tournament slot opens."
          );
          error.statusCode = 400;
          throw error;
        }

        if (!paymentMethod && paymentReference) {
          const error = new Error("Choose a payment method before adding a payment reference.");
          error.statusCode = 400;
          throw error;
        }

        if (Number(registrationCharge.amount_due || 0) <= 0 && paymentMethod) {
          const error = new Error("This tournament does not require an entry payment.");
          error.statusCode = 400;
          throw error;
        }

        if (paymentMethod || paymentReference) {
          const error = new Error(
            "Customers cannot mark tournament fees as paid. Tournament staff must record received payments."
          );
          error.statusCode = 409;
          throw error;
        }

        const [userRows] = await connection.query(
          `
            SELECT uid, name, email, mobile
            FROM users
            WHERE uid = ?
            LIMIT 1
          `,
          [userId]
        );

        const user = userRows[0];
        if (!user) {
          const error = new Error("User not found.");
          error.statusCode = 404;
          throw error;
        }

        const isSoloTournament =
          String(currentTournament.format || "").trim().toLowerCase() === TOURNAMENT_FORMAT_SOLO;
        const registrationType = isSoloTournament
          ? TOURNAMENT_REGISTRATION_TYPE_SOLO
          : TOURNAMENT_REGISTRATION_TYPE_TEAM;

        if (isSoloTournament && teamId) {
          const error = new Error("Solo tournaments cannot use a saved team.");
          error.statusCode = 400;
          throw error;
        }

        if (!isSoloTournament && teamId && (teamName || rosterInput.length)) {
          const error = new Error(
            "Choose either a saved team or a custom team roster for registration."
          );
          error.statusCode = 400;
          throw error;
        }

        if (!isSoloTournament && !teamId && !teamName) {
          const error = new Error("Team name is required for this tournament.");
          error.statusCode = 400;
          throw error;
        }

        let resolvedTeamId = null;
        let resolvedTeamName = isSoloTournament ? null : teamName.slice(0, 160);
        let rosterResult;

        if (!isSoloTournament && teamId) {
          const savedTeam = await getOwnedTournamentTeam(connection, teamId, userId);

          if (!savedTeam) {
            const error = new Error("Saved team not found.");
            error.statusCode = 404;
            throw error;
          }

          const [savedTeamMemberRows] = await connection.query(
            `
              SELECT *
              FROM tournament_team_members
              WHERE team_id = ?
              ORDER BY slot_number ASC, team_member_id ASC
            `,
            [teamId]
          );

          rosterResult = buildRegistrationMembersFromSavedTeam({
            tournament: currentTournament,
            user,
            teamMembers: savedTeamMemberRows,
          });
          resolvedTeamId = Number(savedTeam.team_id || 0) || null;
          resolvedTeamName = String(savedTeam.team_name || "").trim().slice(0, 160);
        } else {
          rosterResult = buildRegistrationMembers({
            tournament: currentTournament,
            user,
            roster: rosterInput,
          });
        }

        if (rosterResult.errors.length) {
          const error = new Error(rosterResult.errors.join(" "));
          error.statusCode = 400;
          throw error;
        }

        const existingRegistration = await getTournamentRegistration(connection, tournamentId, userId);

        if (existingRegistration?.status === TOURNAMENT_REGISTRATION_STATUS_REGISTERED) {
          const error = new Error("You are already registered for this tournament.");
          error.statusCode = 409;
          throw error;
        }

        const currentRegistrationStatus = existingRegistration?.status
          ? normalizeTournamentRegistrationStatus(existingRegistration.status)
          : null;

        if (
          existingRegistration &&
          currentRegistrationStatus !== nextRegistrationStatus &&
          (currentRegistrationStatus === TOURNAMENT_REGISTRATION_STATUS_REGISTERED ||
            nextRegistrationStatus === TOURNAMENT_REGISTRATION_STATUS_REGISTERED)
        ) {
          await resetTournamentBracketIfEditable(connection, tournamentId);
        }

        let targetRegistrationId = Number(existingRegistration?.registration_id || 0);

        if (existingRegistration) {
          await connection.query(
            `
              UPDATE tournament_registrations
              SET
                registration_type = ?,
                status = ?,
                attendance_status = ?,
                checked_in_at = NULL,
                checked_in_by = NULL,
                no_show_marked_at = NULL,
                no_show_marked_by = NULL,
                participant_name = ?,
                participant_email = ?,
                participant_mobile = ?,
                team_name = ?,
                team_id = ?,
                cancelled_at = NULL,
                waitlisted_at = CASE
                  WHEN ? = '${TOURNAMENT_REGISTRATION_STATUS_WAITLISTED}'
                  THEN CASE
                    WHEN status = '${TOURNAMENT_REGISTRATION_STATUS_WAITLISTED}'
                    THEN COALESCE(waitlisted_at, NOW())
                    ELSE NOW()
                  END
                  ELSE waitlisted_at
                END,
                waitlist_promoted_at = CASE
                  WHEN ? = '${TOURNAMENT_REGISTRATION_STATUS_REGISTERED}'
                    AND status = '${TOURNAMENT_REGISTRATION_STATUS_WAITLISTED}'
                  THEN NOW()
                  ELSE waitlist_promoted_at
                END,
                updated_at = NOW()
              WHERE registration_id = ?
            `,
            [
              registrationType,
              nextRegistrationStatus,
              TOURNAMENT_ATTENDANCE_STATUS_PENDING,
              user.name,
              user.email,
              user.mobile || null,
              resolvedTeamName,
              resolvedTeamId,
              nextRegistrationStatus,
              nextRegistrationStatus,
              existingRegistration.registration_id,
            ]
          );
          await replaceTournamentRegistrationMembers(
            connection,
            existingRegistration.registration_id,
            rosterResult.members
          );
        } else {
          await connection.query(
            `
              INSERT INTO tournament_registrations (
                tournament_id,
                user_id,
                registration_type,
                status,
                attendance_status,
                participant_name,
                participant_email,
                participant_mobile,
                team_name,
                team_id,
                waitlisted_at,
                waitlist_promoted_at,
                created_at,
                updated_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `,
            [
              tournamentId,
              userId,
              registrationType,
              nextRegistrationStatus,
              TOURNAMENT_ATTENDANCE_STATUS_PENDING,
              user.name,
              user.email,
              user.mobile || null,
              resolvedTeamName,
              resolvedTeamId,
              nextRegistrationStatus === TOURNAMENT_REGISTRATION_STATUS_WAITLISTED
                ? new Date()
                : null,
              null,
            ]
          );

          const [createdRows] = await connection.query(
            `
              SELECT registration_id
              FROM tournament_registrations
              WHERE tournament_id = ?
              AND user_id = ?
              LIMIT 1
            `,
            [tournamentId, userId]
          );

          targetRegistrationId = Number(createdRows[0]?.registration_id || 0);
          if (targetRegistrationId) {
            await replaceTournamentRegistrationMembers(
              connection,
              targetRegistrationId,
              rosterResult.members
            );
          }
        }

        if (targetRegistrationId) {
          await ensureTournamentRegistrationPaymentRecord(connection, {
            tournament: currentTournament,
            registration: {
              registration_id: targetRegistrationId,
              tournament_id: tournamentId,
              user_id: userId,
              status: nextRegistrationStatus,
              premium_access: premiumAccess,
            },
            premiumAccess,
          });

          if (
            nextRegistrationStatus === TOURNAMENT_REGISTRATION_STATUS_REGISTERED &&
            Number(registrationCharge.amount_due || 0) > 0 &&
            paymentMethod
          ) {
            await markTournamentRegistrationPaid(connection, {
              tournament: currentTournament,
              registrationId: targetRegistrationId,
              paymentMethod,
              paymentReference,
              paymentNotes,
            });
          }
        }

        await syncTournamentRegisteredCount(connection, tournamentId);
        await syncTournamentOperationsStageForRegistrationChanges(connection, tournamentId);

        let promotedRegistrations = [];
        if (nextRegistrationStatus !== TOURNAMENT_REGISTRATION_STATUS_WAITLISTED) {
          // No-op: direct registrations consume an active slot.
        } else if (currentRegistrationStatus === TOURNAMENT_REGISTRATION_STATUS_REGISTERED) {
          promotedRegistrations = await promoteTournamentWaitlistIfPossible(connection, tournamentId);
        }

        const [rows] = await connection.query(
          `
            SELECT
              ${buildTournamentSelectFields("t")},
              ${buildTournamentRegistrationProjection("tr")}
            FROM tournaments t
            JOIN tournament_registrations tr ON tr.tournament_id = t.tournament_id
            WHERE t.tournament_id = ?
            AND tr.user_id = ?
            LIMIT 1
          `,
          [tournamentId, userId]
        );

        const withRelations = await attachRegistrationRelations(rows, connection);
        const updatedTournament = withRelations[0] || null;
        let notificationBatch = {
          campaign: null,
          notifications: [],
          emailJobs: [],
        };

        if (updatedTournament) {
          const recipient = buildTournamentNotificationRecipientsFromRegistrations(
            currentTournament,
            [updatedTournament]
          );

          if (nextRegistrationStatus === TOURNAMENT_REGISTRATION_STATUS_WAITLISTED) {
            notificationBatch = await createTournamentNotificationCampaignWithDeliveries(
              connection,
              {
                tournamentId,
                eventType: TOURNAMENT_NOTIFICATION_EVENT_WAITLIST_JOINED,
                recipientScope: TOURNAMENT_NOTIFICATION_SCOPE_WAITLISTED,
                title: `${currentTournament.title} waitlist joined`,
                message:
                  "The active field is currently full. Your registration has been placed on the tournament waitlist.",
                sendEmail: false,
                recipients: recipient,
                buildRecipientNotification: () => ({
                  title: `${currentTournament.title} waitlist joined`,
                  message: `You are on the waitlist for ${currentTournament.title}. We will notify you if an active slot opens.`,
                }),
              }
            );
          } else if (currentRegistrationStatus === TOURNAMENT_REGISTRATION_STATUS_WAITLISTED) {
            notificationBatch = await createWaitlistPromotionNotifications(
              connection,
              currentTournament,
              [updatedTournament]
            );
          }
        }

        return {
          tournament: updatedTournament,
          promotedRegistrations,
          notificationBatch,
          nextRegistrationStatus,
          currentRegistrationStatus,
        };
      });

      await dispatchTournamentNotificationEmails(result.notificationBatch.emailJobs);

      const message =
        result.nextRegistrationStatus === TOURNAMENT_REGISTRATION_STATUS_WAITLISTED
          ? String(result.tournament?.registration_type || "").trim().toLowerCase() ===
            TOURNAMENT_REGISTRATION_TYPE_TEAM
            ? "Team added to the tournament waitlist."
            : "Added to the tournament waitlist."
          : result.currentRegistrationStatus === TOURNAMENT_REGISTRATION_STATUS_WAITLISTED
            ? "Waitlist slot confirmed."
            : String(result.tournament?.registration_type || "").trim().toLowerCase() ===
                TOURNAMENT_REGISTRATION_TYPE_TEAM
              ? "Team registration confirmed."
              : "Tournament registration confirmed.";

      return res.json({
        message,
        tournament: serializeTournament(result.tournament),
        notification: result.notificationBatch.notifications[0] || null,
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.post("/withdraw", auth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const tournamentId = Number(req.body?.tournament_id || 0);
    const refundNotes = String(req.body?.refund_notes || "").trim();

    if (!userId) {
      return res.status(401).json({ error: "User token required." });
    }

    if (!tournamentId) {
      return res.status(400).json({ error: "Tournament id is required." });
    }

    try {
      const result = await withTransaction(async (connection) => {
        const [rows] = await connection.query(
          `
            SELECT
              ${buildTournamentSelectFields("t")},
              ${buildTournamentRegistrationProjection("tr")}
            FROM tournaments t
            JOIN tournament_registrations tr ON tr.tournament_id = t.tournament_id
            WHERE t.tournament_id = ?
            AND tr.user_id = ?
            LIMIT 1
            FOR UPDATE
          `,
          [tournamentId, userId]
        );

        const existingRegistration = rows[0];

        if (!existingRegistration) {
          const error = new Error("Tournament registration not found.");
          error.statusCode = 404;
          throw error;
        }

        if (!canWithdrawTournamentRegistration(existingRegistration)) {
          const error = new Error("This tournament registration can no longer be withdrawn.");
          error.statusCode = 400;
          throw error;
        }

        const currentRegistrationStatus = normalizeTournamentRegistrationStatus(
          existingRegistration.registration_status || existingRegistration.status
        );
        let refundResult = {
          refundRequested: false,
          refundableAmount: 0,
        };
        let refundNotificationBatch = {
          campaign: null,
          notifications: [],
          emailJobs: [],
        };

        if (currentRegistrationStatus === TOURNAMENT_REGISTRATION_STATUS_REGISTERED) {
          await resetTournamentBracketIfEditable(connection, tournamentId);
        }

        await connection.query(
          `
            UPDATE tournament_registrations
            SET
              status = ?,
              attendance_status = ?,
              checked_in_at = NULL,
              checked_in_by = NULL,
              no_show_marked_at = NULL,
              no_show_marked_by = NULL,
              cancelled_at = NOW(),
              updated_at = NOW()
            WHERE registration_id = ?
          `,
          [
            TOURNAMENT_REGISTRATION_STATUS_CANCELLED,
            TOURNAMENT_ATTENDANCE_STATUS_PENDING,
            existingRegistration.registration_id,
          ]
        );

        const payment = await ensureTournamentRegistrationPaymentRecord(connection, {
          tournament: existingRegistration,
          registration: {
            ...existingRegistration,
            status: TOURNAMENT_REGISTRATION_STATUS_CANCELLED,
          },
        });
        refundResult = await requestTournamentRegistrationRefundIfEligible(connection, {
          tournament: existingRegistration,
          registration: {
            ...existingRegistration,
            status: TOURNAMENT_REGISTRATION_STATUS_CANCELLED,
          },
          payment,
          notes: refundNotes || "Tournament registration withdrawn by participant.",
        });

        if (refundResult.refundRequested) {
          const refundedRegistrations = await hydrateTournamentRegistrations(connection, [
            existingRegistration.registration_id,
          ]);
          refundNotificationBatch = await createTournamentRegistrationPaymentNotifications(
            connection,
            existingRegistration,
            refundedRegistrations,
            {
              title: `${existingRegistration.title} refund request opened`,
              message:
                "Your tournament withdrawal has opened a refund review based on the event policy.",
              sendEmail: false,
              buildRecipientNotification: (recipient) => ({
                title: `${existingRegistration.title} refund request opened`,
                message: `${
                  recipient.team_name || recipient.participant_name || "Your entry"
                } is now in the refund review queue based on the tournament policy.`,
              }),
            }
          );
        }

        const promotedRegistrations =
          currentRegistrationStatus === TOURNAMENT_REGISTRATION_STATUS_REGISTERED
            ? await promoteTournamentWaitlistIfPossible(connection, tournamentId)
            : [];

        await syncTournamentRegisteredCount(connection, tournamentId);
        await syncTournamentOperationsStageForRegistrationChanges(connection, tournamentId);

        const [tournamentRows] = await connection.query(
          `
            SELECT ${buildTournamentSelectFields()}
            FROM tournaments
            WHERE tournament_id = ?
            LIMIT 1
          `,
          [tournamentId]
        );

        const notificationBatch = await createWaitlistPromotionNotifications(
          connection,
          tournamentRows[0] || null,
          promotedRegistrations
        );

        return {
          tournament: tournamentRows[0] || null,
          notificationBatch,
          refundNotificationBatch,
          refundResult,
        };
      });

      await dispatchTournamentNotificationEmails([
        ...result.notificationBatch.emailJobs,
        ...result.refundNotificationBatch.emailJobs,
      ]);

      const message = result.refundResult.refundRequested
        ? `Tournament registration withdrawn. Refund review opened for Rs ${formatTournamentPaymentAmount(
            result.refundResult.refundableAmount
          )}.`
        : "Tournament registration withdrawn.";

      return res.json({
        message,
        tournament: serializeTournament(result.tournament),
        promoted_registrations: result.notificationBatch.notifications.length,
        refund_requested: Boolean(result.refundResult.refundRequested),
        refundable_amount: Number(result.refundResult.refundableAmount || 0),
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  });
}

module.exports = {
  registerTournamentParticipantRoutes,
};
