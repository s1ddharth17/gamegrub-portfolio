const adminAuth = require("../middleware/adminAuth");
const { ADMIN_PERMISSIONS } = require("../utils/adminAccess");
const { withTransaction } = require("../utils/db");
const {
  TOURNAMENT_NOTIFICATION_EVENT_WAITLIST_JOINED,
  TOURNAMENT_NOTIFICATION_SCOPE_WAITLISTED,
} = require("../utils/tournamentNotifications");
const {
  TOURNAMENT_ATTENDANCE_STATUSES,
  TOURNAMENT_ATTENDANCE_STATUS_CHECKED_IN,
  TOURNAMENT_ATTENDANCE_STATUS_NO_SHOW,
  TOURNAMENT_ATTENDANCE_STATUS_PENDING,
  TOURNAMENT_REGISTRATION_STATUSES,
  TOURNAMENT_REGISTRATION_STATUS_CANCELLED,
  TOURNAMENT_REGISTRATION_STATUS_REGISTERED,
  TOURNAMENT_REGISTRATION_STATUS_WAITLISTED,
  TOURNAMENT_STATUS_COMPLETED,
  canManageTournamentAttendance,
  canPlaceTournamentRegistrationOnWaitlist,
  canPromoteWaitlistedTournamentRegistration,
  canReinstateTournamentRegistration,
  normalizeTournamentAttendanceStatus,
  normalizeTournamentRegistrationStatus,
  serializeTournament,
  serializeTournamentRegistration,
} = require("../utils/tournaments");
const {
  TOURNAMENT_PAYMENT_STATUS_NOT_DUE,
  TOURNAMENT_PAYMENT_STATUS_PARTIALLY_REFUNDED,
  TOURNAMENT_PAYMENT_STATUS_REFUNDED,
  TOURNAMENT_PAYMENT_STATUS_WAIVED,
  TOURNAMENT_REFUND_STATUS_PROCESSING,
  TOURNAMENT_REFUND_STATUS_REFUNDED,
  TOURNAMENT_REFUND_STATUS_REJECTED,
  buildTournamentPaymentSnapshot,
  buildTournamentRegistrationCharge,
} = require("../utils/tournamentPayments");
const {
  buildTournamentNotificationRecipientsFromRegistrations,
  buildTournamentSelectFields,
  createTournamentNotificationCampaignWithDeliveries,
  dispatchTournamentNotificationEmails,
  syncTournamentRegisteredCount,
} = require("./tournamentRouteSupport");
const { resetTournamentBracketIfEditable } = require("./tournamentBracketPersistenceSupport");
const {
  attachRegistrationRelations,
  buildTournamentPaymentResetFields,
  createTournamentRegistrationPaymentNotifications,
  createWaitlistPromotionNotifications,
  ensureTournamentRegistrationPaymentRecord,
  formatTournamentPaymentAmount,
  hydrateTournamentRegistrations,
  markTournamentRegistrationPaid,
  normalizeTournamentPaymentAmountInput,
  promoteTournamentWaitlistIfPossible,
  requestTournamentRegistrationRefundIfEligible,
  resetTournamentRegistrationAttendance,
  syncTournamentOperationsStageForRegistrationChanges,
  updateTournamentRegistrationPaymentRecord,
} = require("./tournamentRegistrationSupport");

function getAdminActorId(req) {
  return Number(req.admin?.id || 0) || null;
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

async function getRegistrationRow(
  connection,
  tournamentId,
  registrationId,
  { forUpdate = false } = {}
) {
  const [rows] = await connection.query(
    `
      SELECT *
      FROM tournament_registrations
      WHERE tournament_id = ?
      AND registration_id = ?
      LIMIT 1
      ${forUpdate ? "FOR UPDATE" : ""}
    `,
    [tournamentId, registrationId]
  );

  return rows[0] || null;
}

async function getHydratedRegistration(connection, registrationId) {
  const [rows] = await connection.query(
    `
      SELECT *
      FROM tournament_registrations
      WHERE registration_id = ?
      LIMIT 1
    `,
    [registrationId]
  );

  const withRelations = await attachRegistrationRelations(rows, connection);
  return withRelations[0] || null;
}

function registerTournamentAdminRegistrationRoutes(router) {
  router.post(
    "/admin/:id/registrations/:registrationId/status",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      const tournamentId = Number(req.params.id || 0);
      const registrationId = Number(req.params.registrationId || 0);
      const requestedStatus = String(req.body?.status || "").trim().toLowerCase();

      if (!tournamentId || !registrationId) {
        return res
          .status(400)
          .json({ error: "Tournament id and registration id are required." });
      }

      if (!TOURNAMENT_REGISTRATION_STATUSES.has(requestedStatus)) {
        return res.status(400).json({ error: "A valid registration status is required." });
      }

      try {
        const result = await withTransaction(async (connection) => {
          const tournament = await getTournamentRow(connection, tournamentId, { forUpdate: true });

          if (!tournament) {
            const error = new Error("Tournament not found.");
            error.statusCode = 404;
            throw error;
          }

          const registration = await getRegistrationRow(connection, tournamentId, registrationId, {
            forUpdate: true,
          });

          if (!registration) {
            const error = new Error("Tournament registration not found.");
            error.statusCode = 404;
            throw error;
          }

          const nextStatus = normalizeTournamentRegistrationStatus(requestedStatus);
          const currentStatus = normalizeTournamentRegistrationStatus(registration.status);
          let promotedRegistrations = [];
          let primaryNotificationBatch = {
            campaign: null,
            notifications: [],
            emailJobs: [],
          };
          let paymentNotificationBatch = {
            campaign: null,
            notifications: [],
            emailJobs: [],
          };
          let refundResult = {
            refundRequested: false,
            refundableAmount: 0,
          };

          if (nextStatus === currentStatus) {
            await syncTournamentRegisteredCount(connection, tournamentId);
          } else if (
            currentStatus === TOURNAMENT_REGISTRATION_STATUS_REGISTERED ||
            nextStatus === TOURNAMENT_REGISTRATION_STATUS_REGISTERED
          ) {
            await resetTournamentBracketIfEditable(connection, tournamentId);
          }

          if (nextStatus === currentStatus) {
            // No registration state change was required after the tournament count sync above.
          } else if (nextStatus === TOURNAMENT_REGISTRATION_STATUS_CANCELLED) {
            if (String(tournament.status || "").trim().toLowerCase() === TOURNAMENT_STATUS_COMPLETED) {
              const error = new Error(
                "Completed tournaments can no longer change participant status."
              );
              error.statusCode = 400;
              throw error;
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
                registrationId,
              ]
            );
            const payment = await ensureTournamentRegistrationPaymentRecord(connection, {
              tournament,
              registration: {
                ...registration,
                status: TOURNAMENT_REGISTRATION_STATUS_CANCELLED,
              },
            });
            refundResult = await requestTournamentRegistrationRefundIfEligible(connection, {
              tournament,
              registration: {
                ...registration,
                status: TOURNAMENT_REGISTRATION_STATUS_CANCELLED,
              },
              payment,
              notes: "Tournament registration cancelled by admin.",
            });

            if (refundResult.refundRequested) {
              const refundedRegistrations = await hydrateTournamentRegistrations(connection, [
                registrationId,
              ]);
              paymentNotificationBatch = await createTournamentRegistrationPaymentNotifications(
                connection,
                tournament,
                refundedRegistrations,
                {
                  title: `${tournament.title} refund request opened`,
                  message:
                    "An admin has cancelled this tournament entry and opened a refund review based on the tournament policy.",
                  sendEmail: false,
                  buildRecipientNotification: (recipient) => ({
                    title: `${tournament.title} refund request opened`,
                    message: `${
                      recipient.team_name || recipient.participant_name || "Your entry"
                    } is now in the refund review queue after an admin cancelled the registration.`,
                  }),
                }
              );
            }
            if (currentStatus === TOURNAMENT_REGISTRATION_STATUS_REGISTERED) {
              promotedRegistrations = await promoteTournamentWaitlistIfPossible(
                connection,
                tournamentId,
                {
                  excludeRegistrationIds: [registrationId],
                }
              );
            }
            await syncTournamentRegisteredCount(connection, tournamentId);
            await syncTournamentOperationsStageForRegistrationChanges(
              connection,
              tournamentId,
              getAdminActorId(req)
            );
          } else if (nextStatus === TOURNAMENT_REGISTRATION_STATUS_WAITLISTED) {
            const waitlistCandidate = {
              ...tournament,
              registration_status: currentStatus,
            };

            if (!canPlaceTournamentRegistrationOnWaitlist(waitlistCandidate)) {
              const error = new Error(
                "This participant cannot be moved to the waitlist because the tournament is already locked."
              );
              error.statusCode = 400;
              throw error;
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
                  cancelled_at = NULL,
                  waitlisted_at = CASE
                    WHEN status = '${TOURNAMENT_REGISTRATION_STATUS_WAITLISTED}' THEN waitlisted_at
                    ELSE NOW()
                  END,
                  updated_at = NOW()
                WHERE registration_id = ?
              `,
              [
                TOURNAMENT_REGISTRATION_STATUS_WAITLISTED,
                TOURNAMENT_ATTENDANCE_STATUS_PENDING,
                registrationId,
              ]
            );
            await ensureTournamentRegistrationPaymentRecord(connection, {
              tournament,
              registration: {
                ...registration,
                status: TOURNAMENT_REGISTRATION_STATUS_WAITLISTED,
              },
            });

            if (currentStatus === TOURNAMENT_REGISTRATION_STATUS_REGISTERED) {
              promotedRegistrations = await promoteTournamentWaitlistIfPossible(
                connection,
                tournamentId,
                {
                  excludeRegistrationIds: [registrationId],
                }
              );
            }

            await syncTournamentRegisteredCount(connection, tournamentId);
            await syncTournamentOperationsStageForRegistrationChanges(
              connection,
              tournamentId,
              getAdminActorId(req)
            );
          } else {
            const [countRows] = await connection.query(
              `
                SELECT COUNT(*) AS total
                FROM tournament_registrations
                WHERE tournament_id = ?
                AND status = ?
                AND registration_id <> ?
              `,
              [tournamentId, TOURNAMENT_REGISTRATION_STATUS_REGISTERED, registrationId]
            );

            const activeRegistrationCount = Number(countRows[0]?.total || 0);

            if (currentStatus === TOURNAMENT_REGISTRATION_STATUS_WAITLISTED) {
              const promotionCandidate = {
                ...tournament,
                registration_status: currentStatus,
              };

              if (
                !canPromoteWaitlistedTournamentRegistration(
                  promotionCandidate,
                  activeRegistrationCount
                )
              ) {
                const error = new Error(
                  "This waitlisted participant cannot be promoted because the active field is locked or already full."
                );
                error.statusCode = 400;
                throw error;
              }
            } else {
              const reinstateCandidate = {
                ...tournament,
                registration_status: currentStatus,
              };

              if (!canReinstateTournamentRegistration(reinstateCandidate, activeRegistrationCount)) {
                const error = new Error(
                  "This participant cannot be reinstated because the tournament is locked or already full."
                );
                error.statusCode = 400;
                throw error;
              }
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
                  cancelled_at = NULL,
                  waitlist_promoted_at = CASE
                    WHEN status = '${TOURNAMENT_REGISTRATION_STATUS_WAITLISTED}' THEN NOW()
                    ELSE waitlist_promoted_at
                  END,
                  updated_at = NOW()
                WHERE registration_id = ?
              `,
              [
                TOURNAMENT_REGISTRATION_STATUS_REGISTERED,
                TOURNAMENT_ATTENDANCE_STATUS_PENDING,
                registrationId,
              ]
            );
            await ensureTournamentRegistrationPaymentRecord(connection, {
              tournament,
              registration: {
                ...registration,
                status: TOURNAMENT_REGISTRATION_STATUS_REGISTERED,
              },
            });
            await syncTournamentRegisteredCount(connection, tournamentId);
            await syncTournamentOperationsStageForRegistrationChanges(
              connection,
              tournamentId,
              getAdminActorId(req)
            );
          }

          const updatedTournament = await getTournamentRow(connection, tournamentId);
          const updatedRegistration = await getHydratedRegistration(connection, registrationId);

          if (nextStatus === TOURNAMENT_REGISTRATION_STATUS_WAITLISTED) {
            primaryNotificationBatch = await createTournamentNotificationCampaignWithDeliveries(
              connection,
              {
                tournamentId,
                eventType: TOURNAMENT_NOTIFICATION_EVENT_WAITLIST_JOINED,
                recipientScope: TOURNAMENT_NOTIFICATION_SCOPE_WAITLISTED,
                title: `${tournament.title} moved to waitlist`,
                message:
                  "The tournament field was adjusted and this entry has been placed on the waitlist.",
                sendEmail: false,
                recipients: buildTournamentNotificationRecipientsFromRegistrations(
                  updatedTournament || tournament,
                  updatedRegistration ? [updatedRegistration] : []
                ),
                buildRecipientNotification: () => ({
                  title: `${tournament.title} moved to waitlist`,
                  message:
                    "Your tournament entry is currently on the waitlist. We will notify you if an active slot opens.",
                }),
              }
            );
          } else if (currentStatus === TOURNAMENT_REGISTRATION_STATUS_WAITLISTED) {
            primaryNotificationBatch = await createWaitlistPromotionNotifications(
              connection,
              updatedTournament || tournament,
              updatedRegistration ? [updatedRegistration] : []
            );
          }

          const promotedNotificationBatch = await createWaitlistPromotionNotifications(
            connection,
            updatedTournament || tournament,
            promotedRegistrations
          );

          return {
            tournament: updatedTournament,
            registration: updatedRegistration,
            emailJobs: [
              ...primaryNotificationBatch.emailJobs,
              ...promotedNotificationBatch.emailJobs,
              ...paymentNotificationBatch.emailJobs,
            ],
            refundResult,
          };
        });

        await dispatchTournamentNotificationEmails(result.emailJobs);

        return res.json({
          message:
            requestedStatus === TOURNAMENT_REGISTRATION_STATUS_CANCELLED
              ? result.refundResult.refundRequested
                ? `Participant registration cancelled and refund review opened for Rs ${formatTournamentPaymentAmount(
                    result.refundResult.refundableAmount
                  )}.`
                : "Participant registration cancelled."
              : requestedStatus === TOURNAMENT_REGISTRATION_STATUS_WAITLISTED
                ? "Participant moved to the waitlist."
                : "Participant registration reinstated.",
          tournament: serializeTournament(result.tournament),
          registration: serializeTournamentRegistration(result.registration),
          refund_requested: Boolean(result.refundResult.refundRequested),
          refundable_amount: Number(result.refundResult.refundableAmount || 0),
        });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  router.post(
    "/admin/:id/registrations/:registrationId/attendance",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      const tournamentId = Number(req.params.id || 0);
      const registrationId = Number(req.params.registrationId || 0);
      const requestedAttendanceStatus = String(req.body?.attendance_status || "")
        .trim()
        .toLowerCase();

      if (!tournamentId || !registrationId) {
        return res
          .status(400)
          .json({ error: "Tournament id and registration id are required." });
      }

      if (!TOURNAMENT_ATTENDANCE_STATUSES.has(requestedAttendanceStatus)) {
        return res.status(400).json({ error: "A valid attendance status is required." });
      }

      try {
        const result = await withTransaction(async (connection) => {
          const tournament = await getTournamentRow(connection, tournamentId, { forUpdate: true });

          if (!tournament) {
            const error = new Error("Tournament not found.");
            error.statusCode = 404;
            throw error;
          }

          const registration = await getRegistrationRow(connection, tournamentId, registrationId, {
            forUpdate: true,
          });

          if (!registration) {
            const error = new Error("Tournament registration not found.");
            error.statusCode = 404;
            throw error;
          }

          if (!canManageTournamentAttendance(tournament, registration)) {
            const error = new Error(
              "Attendance can only be managed for active registrations on active tournaments."
            );
            error.statusCode = 400;
            throw error;
          }

          const nextAttendanceStatus = normalizeTournamentAttendanceStatus(
            requestedAttendanceStatus
          );
          const currentAttendanceStatus = normalizeTournamentAttendanceStatus(
            registration.attendance_status
          );

          if (
            currentAttendanceStatus === TOURNAMENT_ATTENDANCE_STATUS_NO_SHOW ||
            nextAttendanceStatus === TOURNAMENT_ATTENDANCE_STATUS_NO_SHOW
          ) {
            await resetTournamentBracketIfEditable(connection, tournamentId);
          }

          if (nextAttendanceStatus === TOURNAMENT_ATTENDANCE_STATUS_PENDING) {
            await resetTournamentRegistrationAttendance(connection, registrationId);
          } else if (nextAttendanceStatus === TOURNAMENT_ATTENDANCE_STATUS_CHECKED_IN) {
            await connection.query(
              `
                UPDATE tournament_registrations
                SET
                  attendance_status = ?,
                  checked_in_at = NOW(),
                  checked_in_by = ?,
                  no_show_marked_at = NULL,
                  no_show_marked_by = NULL,
                  updated_at = NOW()
                WHERE registration_id = ?
              `,
              [
                TOURNAMENT_ATTENDANCE_STATUS_CHECKED_IN,
                getAdminActorId(req),
                registrationId,
              ]
            );
          } else {
            await connection.query(
              `
                UPDATE tournament_registrations
                SET
                  attendance_status = ?,
                  checked_in_at = NULL,
                  checked_in_by = NULL,
                  no_show_marked_at = NOW(),
                  no_show_marked_by = ?,
                  updated_at = NOW()
                WHERE registration_id = ?
              `,
              [
                TOURNAMENT_ATTENDANCE_STATUS_NO_SHOW,
                getAdminActorId(req),
                registrationId,
              ]
            );
          }

          const updatedTournament = await getTournamentRow(connection, tournamentId);
          const updatedRegistration = await getHydratedRegistration(connection, registrationId);

          return {
            tournament: updatedTournament,
            registration: updatedRegistration,
          };
        });

        return res.json({
          message:
            requestedAttendanceStatus === TOURNAMENT_ATTENDANCE_STATUS_CHECKED_IN
              ? "Participant checked in."
              : requestedAttendanceStatus === TOURNAMENT_ATTENDANCE_STATUS_NO_SHOW
                ? "Participant marked as no-show."
                : "Participant check-in reset.",
          tournament: serializeTournament(result.tournament),
          registration: serializeTournamentRegistration(result.registration),
        });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  router.post(
    "/admin/:id/registrations/:registrationId/payment",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      const tournamentId = Number(req.params.id || 0);
      const registrationId = Number(req.params.registrationId || 0);
      const action = String(req.body?.action || "").trim().toLowerCase();
      const paymentMethod = String(req.body?.payment_method || "").trim();
      const paymentReference = String(req.body?.payment_reference || "").trim();
      const paymentNotes = String(req.body?.payment_notes || "").trim();

      if (!tournamentId || !registrationId) {
        return res
          .status(400)
          .json({ error: "Tournament id and registration id are required." });
      }

      if (!["mark_paid", "waive", "set_pending", "set_not_due"].includes(action)) {
        return res.status(400).json({ error: "A valid payment action is required." });
      }

      try {
        const result = await withTransaction(async (connection) => {
          const tournament = await getTournamentRow(connection, tournamentId, { forUpdate: true });

          if (!tournament) {
            const error = new Error("Tournament not found.");
            error.statusCode = 404;
            throw error;
          }

          const registration = await getRegistrationRow(connection, tournamentId, registrationId, {
            forUpdate: true,
          });

          if (!registration) {
            const error = new Error("Tournament registration not found.");
            error.statusCode = 404;
            throw error;
          }

          const registrationStatus = normalizeTournamentRegistrationStatus(registration.status);
          let payment = await ensureTournamentRegistrationPaymentRecord(connection, {
            tournament,
            registration,
          });

          if (!payment) {
            const error = new Error("Unable to create a payment record for this registration.");
            error.statusCode = 500;
            throw error;
          }

          const charge = buildTournamentRegistrationCharge({
            tournament,
            registration,
            payment,
          });

          if (action === "mark_paid") {
            if (registrationStatus !== TOURNAMENT_REGISTRATION_STATUS_REGISTERED) {
              const error = new Error(
                "Only active tournament registrations can be marked as paid."
              );
              error.statusCode = 400;
              throw error;
            }

            if (Number(payment.amount_due || charge.amount_due || 0) <= 0) {
              const error = new Error(
                "This tournament entry does not need a captured payment. Use the waive action instead."
              );
              error.statusCode = 400;
              throw error;
            }

            payment = await markTournamentRegistrationPaid(connection, {
              tournament,
              registrationId,
              paymentMethod,
              paymentReference,
              paymentNotes,
            });
          } else if (action === "waive") {
            if (Number(payment.amount_paid || 0) > 0) {
              const error = new Error(
                "Captured payments cannot be waived. Use the refund flow instead."
              );
              error.statusCode = 400;
              throw error;
            }

            payment = await updateTournamentRegistrationPaymentRecord(connection, registrationId, {
              ...buildTournamentPaymentResetFields({
                tournament,
                registration,
                payment,
                paymentStatus: TOURNAMENT_PAYMENT_STATUS_WAIVED,
                paymentNotes,
              }),
            });
          } else if (action === "set_pending") {
            if (registrationStatus !== TOURNAMENT_REGISTRATION_STATUS_REGISTERED) {
              const error = new Error(
                "Only active tournament registrations can move back to pending payment."
              );
              error.statusCode = 400;
              throw error;
            }

            if (Number(payment.amount_paid || 0) > 0) {
              const error = new Error(
                "Captured payments cannot be reset to pending. Use the refund flow instead."
              );
              error.statusCode = 400;
              throw error;
            }

            payment = await updateTournamentRegistrationPaymentRecord(connection, registrationId, {
              ...buildTournamentPaymentResetFields({
                tournament,
                registration,
                payment,
                paymentStatus:
                  Number(payment.amount_due || charge.amount_due || 0) > 0
                    ? TOURNAMENT_PAYMENT_STATUS_PENDING
                    : TOURNAMENT_PAYMENT_STATUS_WAIVED,
                paymentNotes,
              }),
            });
          } else if (Number(payment.amount_paid || 0) > 0) {
            const error = new Error(
              "Captured payments cannot be marked as not due. Use the refund flow instead."
            );
            error.statusCode = 400;
            throw error;
          } else {
            payment = await updateTournamentRegistrationPaymentRecord(connection, registrationId, {
              ...buildTournamentPaymentResetFields({
                tournament,
                registration,
                payment,
                paymentStatus: TOURNAMENT_PAYMENT_STATUS_NOT_DUE,
                paymentNotes,
              }),
            });
          }

          const updatedTournament = await getTournamentRow(connection, tournamentId);
          const refreshedRegistrations = await hydrateTournamentRegistrations(connection, [
            registrationId,
          ]);
          const updatedRegistration = refreshedRegistrations[0] || null;

          let notificationBatch = {
            campaign: null,
            notifications: [],
            emailJobs: [],
          };

          if (updatedRegistration && action === "mark_paid") {
            notificationBatch = await createTournamentRegistrationPaymentNotifications(
              connection,
              updatedTournament || tournament,
              [updatedRegistration],
              {
                title: `${tournament.title} entry payment recorded`,
                message:
                  "Your tournament entry fee has been recorded and your spot is financially cleared.",
                sendEmail: false,
                buildRecipientNotification: (recipient) => ({
                  title: `${tournament.title} entry payment recorded`,
                  message: `${
                    recipient.team_name || recipient.participant_name || "Your entry"
                  } is now marked as paid for the tournament.`,
                }),
              }
            );
          } else if (updatedRegistration && action === "waive") {
            notificationBatch = await createTournamentRegistrationPaymentNotifications(
              connection,
              updatedTournament || tournament,
              [updatedRegistration],
              {
                title: `${tournament.title} entry fee waived`,
                message: "Your tournament entry fee has been waived by the admin team.",
                sendEmail: false,
              }
            );
          }

          return {
            tournament: updatedTournament,
            registration: updatedRegistration,
            emailJobs: notificationBatch.emailJobs,
          };
        });

        await dispatchTournamentNotificationEmails(result.emailJobs);

        return res.json({
          message:
            action === "mark_paid"
              ? "Tournament payment recorded."
              : action === "waive"
                ? "Tournament entry fee waived."
                : action === "set_pending"
                  ? "Tournament payment moved back to pending."
                  : "Tournament payment marked as not due.",
          tournament: serializeTournament(result.tournament),
          registration: serializeTournamentRegistration(result.registration),
        });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  router.post(
    "/admin/:id/registrations/:registrationId/refund",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      const tournamentId = Number(req.params.id || 0);
      const registrationId = Number(req.params.registrationId || 0);
      const action = String(req.body?.action || "").trim().toLowerCase();
      const notes = String(req.body?.notes || "").trim();
      const processedAmountInput = normalizeTournamentPaymentAmountInput(
        req.body?.processed_amount,
        0
      );

      if (!tournamentId || !registrationId) {
        return res
          .status(400)
          .json({ error: "Tournament id and registration id are required." });
      }

      if (!["request", "processing", "refund", "reject"].includes(action)) {
        return res.status(400).json({ error: "A valid refund action is required." });
      }

      try {
        const result = await withTransaction(async (connection) => {
          const tournament = await getTournamentRow(connection, tournamentId, { forUpdate: true });

          if (!tournament) {
            const error = new Error("Tournament not found.");
            error.statusCode = 404;
            throw error;
          }

          const registration = await getRegistrationRow(connection, tournamentId, registrationId, {
            forUpdate: true,
          });

          if (!registration) {
            const error = new Error("Tournament registration not found.");
            error.statusCode = 404;
            throw error;
          }

          let payment = await ensureTournamentRegistrationPaymentRecord(connection, {
            tournament,
            registration,
          });
          if (!payment) {
            const error = new Error("Tournament payment record not found.");
            error.statusCode = 404;
            throw error;
          }

          const snapshot = buildTournamentPaymentSnapshot({
            tournament,
            registration,
            payment,
          });

          if (action === "request") {
            const requestResult = await requestTournamentRegistrationRefundIfEligible(connection, {
              tournament,
              registration,
              payment,
              notes: notes || "Refund requested by admin.",
            });

            if (!requestResult.refundRequested) {
              const error = new Error(
                "This registration is not currently eligible for a refund."
              );
              error.statusCode = 400;
              throw error;
            }

            payment = requestResult.payment;
          } else if (action === "processing") {
            const requestedAmount = Math.max(
              Number(payment.refund_requested_amount || 0),
              Number(snapshot.refundable_amount || 0)
            );

            if (requestedAmount <= 0) {
              const error = new Error(
                "There is no refundable amount available for processing."
              );
              error.statusCode = 400;
              throw error;
            }

            payment = await updateTournamentRegistrationPaymentRecord(connection, registrationId, {
              refund_status: TOURNAMENT_REFUND_STATUS_PROCESSING,
              refund_requested_amount: requestedAmount,
              refund_requested_at: payment.refund_requested_at || new Date(),
              refund_notes: notes || payment.refund_notes || null,
            });
          } else if (action === "refund") {
            const currentProcessedAmount = Math.max(
              0,
              Number(payment.refund_processed_amount || 0)
            );
            const maxRefundableAmount = Math.max(
              0,
              Number(payment.amount_paid || 0) - currentProcessedAmount
            );
            const refundIncrement = processedAmountInput
              ? processedAmountInput
              : Math.max(
                  Number(payment.refund_requested_amount || 0) - currentProcessedAmount,
                  Number(snapshot.refundable_amount || 0)
                );
            const targetProcessedAmount = currentProcessedAmount + refundIncrement;

            if (refundIncrement <= 0 || refundIncrement > maxRefundableAmount) {
              const error = new Error(
                "Processed refund amount must be greater than 0 and cannot exceed the remaining paid amount."
              );
              error.statusCode = 400;
              throw error;
            }

            payment = await updateTournamentRegistrationPaymentRecord(connection, registrationId, {
              payment_status:
                targetProcessedAmount >= Number(payment.amount_paid || 0)
                  ? TOURNAMENT_PAYMENT_STATUS_REFUNDED
                  : TOURNAMENT_PAYMENT_STATUS_PARTIALLY_REFUNDED,
              refund_status: TOURNAMENT_REFUND_STATUS_REFUNDED,
              refund_requested_amount: Math.max(
                Number(payment.refund_requested_amount || 0),
                targetProcessedAmount
              ),
              refund_processed_amount: targetProcessedAmount,
              refund_processed_at: new Date(),
              refund_notes: notes || payment.refund_notes || null,
            });
          } else {
            payment = await updateTournamentRegistrationPaymentRecord(connection, registrationId, {
              refund_status: TOURNAMENT_REFUND_STATUS_REJECTED,
              refund_notes: notes || payment.refund_notes || null,
            });
          }

          const updatedTournament = await getTournamentRow(connection, tournamentId);
          const refreshedRegistrations = await hydrateTournamentRegistrations(connection, [
            registrationId,
          ]);
          const updatedRegistration = refreshedRegistrations[0] || null;

          let title = `${tournament.title} refund update`;
          let message =
            "Your tournament entry refund has been updated by the admin team.";

          if (action === "request") {
            title = `${tournament.title} refund request opened`;
            message = "Your tournament refund request is now queued for review.";
          } else if (action === "processing") {
            title = `${tournament.title} refund in progress`;
            message =
              "Your tournament refund is now being processed by the admin team.";
          } else if (action === "refund") {
            if (payment.payment_status === TOURNAMENT_PAYMENT_STATUS_REFUNDED) {
              title = `${tournament.title} refund completed`;
              message = `A refund of Rs ${formatTournamentPaymentAmount(
                payment.refund_processed_amount
              )} has been fully recorded for your tournament entry.`;
            } else {
              title = `${tournament.title} partial refund recorded`;
              message = `A partial refund of Rs ${formatTournamentPaymentAmount(
                payment.refund_processed_amount
              )} has been recorded for your tournament entry.`;
            }
          } else if (action === "reject") {
            title = `${tournament.title} refund request closed`;
            message =
              "The tournament refund request has been closed. Check the note for any follow-up details.";
          }

          const notificationBatch = updatedRegistration
            ? await createTournamentRegistrationPaymentNotifications(
                connection,
                updatedTournament || tournament,
                [updatedRegistration],
                {
                  title,
                  message,
                  sendEmail: false,
                }
              )
            : {
                campaign: null,
                notifications: [],
                emailJobs: [],
              };

          return {
            tournament: updatedTournament,
            registration: updatedRegistration,
            emailJobs: notificationBatch.emailJobs,
          };
        });

        await dispatchTournamentNotificationEmails(result.emailJobs);

        return res.json({
          message:
            action === "request"
              ? "Refund request opened."
              : action === "processing"
                ? "Refund marked as processing."
                : action === "refund"
                  ? result.registration?.payment_status === TOURNAMENT_PAYMENT_STATUS_REFUNDED
                    ? "Refund completed."
                    : "Partial refund recorded."
                  : "Refund request rejected.",
          tournament: serializeTournament(result.tournament),
          registration: serializeTournamentRegistration(result.registration),
        });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );
}

module.exports = {
  registerTournamentAdminRegistrationRoutes,
};
