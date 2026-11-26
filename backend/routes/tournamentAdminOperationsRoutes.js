const adminAuth = require("../middleware/adminAuth");
const { ADMIN_PERMISSIONS } = require("../utils/adminAccess");
const { query, withTransaction } = require("../utils/db");
const {
  IMAGE_UPLOAD_MIME_TYPES,
  createUploadMiddleware,
  deleteStoredFile,
  persistUploadedFile,
} = require("../utils/uploadStorage");
const {
  TOURNAMENT_NOTIFICATION_EVENT_BRACKET_READY,
  TOURNAMENT_NOTIFICATION_EVENT_CHAMPION,
  TOURNAMENT_NOTIFICATION_EVENT_MATCH_RESULT,
  TOURNAMENT_NOTIFICATION_SCOPE_ALL_REGISTERED,
  TOURNAMENT_NOTIFICATION_SCOPE_ELIGIBLE_BRACKET,
  filterTournamentNotificationRecipients,
} = require("../utils/tournamentNotifications");
const {
  TOURNAMENT_ATTENDANCE_STATUS_NO_SHOW,
  TOURNAMENT_MATCH_STATUS_COMPLETED,
  TOURNAMENT_MATCH_STATUS_PENDING,
  TOURNAMENT_OPERATIONS_STAGE_READY_FOR_BRACKETS,
  TOURNAMENT_OPERATIONS_STAGE_REGISTRATIONS,
  TOURNAMENT_OPERATIONS_STAGE_SEEDING,
  TOURNAMENT_OPERATIONS_STAGES,
  TOURNAMENT_REGISTRATION_STATUS_REGISTERED,
  TOURNAMENT_STATUS_CANCELLED,
  TOURNAMENT_STATUS_COMPLETED,
  canHandoffTournamentToBrackets,
  createSingleEliminationBracket,
  normalizePositiveInteger,
  normalizeTournamentAttendanceStatus,
  normalizeTournamentMatchStatus,
  serializeTournament,
  serializeTournamentRegistration,
} = require("../utils/tournaments");
const {
  buildAdminOrderSql,
  buildTournamentSelectFields,
  createTournamentNotificationCampaignWithDeliveries,
  dispatchTournamentNotificationEmails,
  getTournamentNotificationRecipients,
  shouldDeleteStoredCoverImage,
} = require("./tournamentRouteSupport");
const {
  getTournamentBracketRoundLabel,
  normalizeOptionalMatchScore,
  sortRegistrationsForBracketOps,
} = require("./tournamentBracketSupport");
const {
  getTournamentBracketPayload,
  propagateTournamentBracketResolution,
  replaceTournamentBracketMatches,
  replaceTournamentBracketSeeds,
  resetTournamentBracketIfEditable,
} = require("./tournamentBracketPersistenceSupport");
const {
  attachRegistrationRelations,
  getTournamentRegistrations,
} = require("./tournamentRegistrationSupport");

const upload = createUploadMiddleware({
  maxFileSizeBytes: 8 * 1024 * 1024,
  allowedMimeTypes: IMAGE_UPLOAD_MIME_TYPES,
});

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

function assertMutableTournament(tournament, message) {
  const tournamentStatus = String(tournament.status || "").trim().toLowerCase();

  if (
    tournamentStatus === TOURNAMENT_STATUS_CANCELLED ||
    tournamentStatus === TOURNAMENT_STATUS_COMPLETED
  ) {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
}

function registerTournamentAdminOperationsRoutes(router) {
  router.get(
    "/admin/:id/registrations",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      const tournamentId = Number(req.params.id || 0);

      if (!tournamentId) {
        return res.status(400).json({ error: "Tournament id is required." });
      }

      try {
        const tournamentRows = await query(
          `
            SELECT ${buildTournamentSelectFields()}
            FROM tournaments
            WHERE tournament_id = ?
            LIMIT 1
          `,
          [tournamentId]
        );
        const tournament = tournamentRows[0] || null;

        if (!tournament) {
          return res.status(404).json({ error: "Tournament not found." });
        }

        const registrations = await getTournamentRegistrations(tournamentId);

        return res.json({
          tournament: serializeTournament(tournament),
          registrations,
        });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }
  );

  router.get(
    "/admin/all",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      try {
        const rows = await query(
          `
            SELECT ${buildTournamentSelectFields()}
            FROM tournaments
            ${buildAdminOrderSql()}
          `
        );

        res.json(rows.map(serializeTournament));
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    }
  );

  router.post(
    "/admin/cover-image",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    upload.single("image"),
    async (req, res) => {
      let storedImage = null;

      try {
        if (!req.file) {
          return res.status(400).json({ error: "Cover image file is required." });
        }

        storedImage = await persistUploadedFile(req.file, {
          folder: "tournaments",
          fallbackBaseName: "tournament_cover",
          allowedMimeTypes: IMAGE_UPLOAD_MIME_TYPES,
        });

        return res.json({
          message: "Tournament cover uploaded.",
          cover_image: storedImage,
        });
      } catch (error) {
        if (storedImage && shouldDeleteStoredCoverImage(storedImage)) {
          try {
            await deleteStoredFile(storedImage);
          } catch (cleanupError) {
            console.warn(
              "Failed to clean up tournament cover upload after error:",
              cleanupError
            );
          }
        }

        return res.status(500).json({ error: error.message });
      }
    }
  );

  router.get(
    "/admin/:id/bracket",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      const tournamentId = Number(req.params.id || 0);

      if (!tournamentId) {
        return res.status(400).json({ error: "Tournament id is required." });
      }

      try {
        const tournamentRows = await query(
          `
            SELECT ${buildTournamentSelectFields()}
            FROM tournaments
            WHERE tournament_id = ?
            LIMIT 1
          `,
          [tournamentId]
        );

        const tournament = tournamentRows[0];
        if (!tournament) {
          return res.status(404).json({ error: "Tournament not found." });
        }

        const bracket = await getTournamentBracketPayload(tournamentId);
        return res.json({
          tournament: serializeTournament(tournament),
          bracket,
        });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }
  );

  router.post(
    "/admin/:id/seeding",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      const tournamentId = Number(req.params.id || 0);
      const seedsInput = Array.isArray(req.body?.seeds) ? req.body.seeds : [];

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

          assertMutableTournament(
            tournament,
            "This tournament can no longer update bracket seeding."
          );

          const [activeRegistrationRows] = await connection.query(
            `
              SELECT registration_id
              FROM tournament_registrations
              WHERE tournament_id = ?
              AND status = ?
              FOR UPDATE
            `,
            [tournamentId, TOURNAMENT_REGISTRATION_STATUS_REGISTERED]
          );

          const activeRegistrationIds = activeRegistrationRows.map((row) =>
            Number(row.registration_id || 0)
          );
          const activeRegistrationIdSet = new Set(activeRegistrationIds);
          const maxSeedNumber = activeRegistrationIds.length;
          const normalizedSeeds = [];
          const seenRegistrationIds = new Set();
          const seenSeedNumbers = new Set();

          for (const seedEntry of seedsInput) {
            const registrationId = Number(seedEntry?.registration_id || 0);
            const rawSeedNumber = seedEntry?.seed_number;

            if (!registrationId || !activeRegistrationIdSet.has(registrationId)) {
              const error = new Error(
                "Seeds can only be assigned to active tournament registrations."
              );
              error.statusCode = 400;
              throw error;
            }

            if (seenRegistrationIds.has(registrationId)) {
              const error = new Error(
                "Each registration can only appear once in the seeding board."
              );
              error.statusCode = 400;
              throw error;
            }

            seenRegistrationIds.add(registrationId);

            if (rawSeedNumber === undefined || rawSeedNumber === null || rawSeedNumber === "") {
              continue;
            }

            const seedNumber = normalizePositiveInteger(rawSeedNumber, 0);
            if (!seedNumber) {
              const error = new Error("Seed numbers must be positive integers.");
              error.statusCode = 400;
              throw error;
            }

            if (maxSeedNumber > 0 && seedNumber > maxSeedNumber) {
              const error = new Error(
                `Seed numbers must stay within 1 and ${maxSeedNumber}.`
              );
              error.statusCode = 400;
              throw error;
            }

            if (seenSeedNumbers.has(seedNumber)) {
              const error = new Error("Seed numbers must be unique within a tournament.");
              error.statusCode = 400;
              throw error;
            }

            seenSeedNumbers.add(seedNumber);
            normalizedSeeds.push({
              registration_id: registrationId,
              seed_number: seedNumber,
            });
          }

          await resetTournamentBracketIfEditable(connection, tournamentId);
          await replaceTournamentBracketSeeds(connection, tournamentId, normalizedSeeds);

          await connection.query(
            `
              UPDATE tournaments
              SET
                operations_stage = ?,
                bracket_handoff_at = NULL,
                bracket_handoff_by = NULL,
                updated_by = ?,
                updated_at = NOW()
              WHERE tournament_id = ?
            `,
            [
              normalizedSeeds.length
                ? TOURNAMENT_OPERATIONS_STAGE_SEEDING
                : TOURNAMENT_OPERATIONS_STAGE_REGISTRATIONS,
              getAdminActorId(req),
              tournamentId,
            ]
          );

          const updatedTournament = await getTournamentRow(connection, tournamentId);
          const [updatedRegistrationRows] = await connection.query(
            `
              SELECT *
              FROM tournament_registrations
              WHERE tournament_id = ?
              ORDER BY
                CASE WHEN status = ? THEN 0 ELSE 1 END ASC,
                registration_id ASC
            `,
            [tournamentId, TOURNAMENT_REGISTRATION_STATUS_REGISTERED]
          );

          const withRelations = await attachRegistrationRelations(
            updatedRegistrationRows,
            connection
          );

          return {
            tournament: updatedTournament,
            registrations: sortRegistrationsForBracketOps(withRelations).map(
              serializeTournamentRegistration
            ),
          };
        });

        return res.json({
          message: "Bracket seeding updated.",
          tournament: serializeTournament(result.tournament),
          registrations: result.registrations,
        });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  router.post(
    "/admin/:id/operations-stage",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      const tournamentId = Number(req.params.id || 0);
      const requestedStage = String(req.body?.operations_stage || "").trim().toLowerCase();

      if (!tournamentId) {
        return res.status(400).json({ error: "Tournament id is required." });
      }

      if (!TOURNAMENT_OPERATIONS_STAGES.has(requestedStage)) {
        return res.status(400).json({ error: "A valid operations stage is required." });
      }

      try {
        const result = await withTransaction(async (connection) => {
          const tournament = await getTournamentRow(connection, tournamentId, { forUpdate: true });

          if (!tournament) {
            const error = new Error("Tournament not found.");
            error.statusCode = 404;
            throw error;
          }

          assertMutableTournament(
            tournament,
            "This tournament can no longer change operations stage."
          );

          const [activeCountRows] = await connection.query(
            `
              SELECT COUNT(*) AS total
              FROM tournament_registrations
              WHERE tournament_id = ?
              AND status = ?
            `,
            [tournamentId, TOURNAMENT_REGISTRATION_STATUS_REGISTERED]
          );

          const [seedCountRows] = await connection.query(
            `
              SELECT COUNT(*) AS total
              FROM tournament_bracket_seeds
              WHERE tournament_id = ?
            `,
            [tournamentId]
          );

          const activeRegistrationCount = Number(activeCountRows[0]?.total || 0);
          const seededCount = Number(seedCountRows[0]?.total || 0);
          const nextStage = requestedStage;

          if (
            nextStage === TOURNAMENT_OPERATIONS_STAGE_READY_FOR_BRACKETS &&
            !canHandoffTournamentToBrackets(tournament, activeRegistrationCount, seededCount)
          ) {
            const error = new Error(
              "Tournament handoff requires at least two active registrations and a complete seeding board."
            );
            error.statusCode = 400;
            throw error;
          }

          if (nextStage !== TOURNAMENT_OPERATIONS_STAGE_READY_FOR_BRACKETS) {
            await resetTournamentBracketIfEditable(connection, tournamentId);
          }

          await connection.query(
            `
              UPDATE tournaments
              SET
                operations_stage = ?,
                bracket_handoff_at = CASE
                  WHEN ? = ? THEN NOW()
                  ELSE NULL
                END,
                bracket_handoff_by = CASE
                  WHEN ? = ? THEN ?
                  ELSE NULL
                END,
                updated_by = ?,
                updated_at = NOW()
              WHERE tournament_id = ?
            `,
            [
              nextStage,
              nextStage,
              TOURNAMENT_OPERATIONS_STAGE_READY_FOR_BRACKETS,
              nextStage,
              TOURNAMENT_OPERATIONS_STAGE_READY_FOR_BRACKETS,
              getAdminActorId(req),
              getAdminActorId(req),
              tournamentId,
            ]
          );

          return getTournamentRow(connection, tournamentId);
        });

        return res.json({
          message:
            requestedStage === TOURNAMENT_OPERATIONS_STAGE_READY_FOR_BRACKETS
              ? "Tournament marked ready for brackets."
              : "Tournament operations stage updated.",
          tournament: serializeTournament(result),
        });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  router.post(
    "/admin/:id/bracket/generate",
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

          assertMutableTournament(
            tournament,
            "This tournament can no longer generate a live bracket."
          );

          const [registrationRows] = await connection.query(
            `
              SELECT
                tr.*,
                tbs.seed_number
              FROM tournament_registrations tr
              LEFT JOIN tournament_bracket_seeds tbs
                ON tbs.registration_id = tr.registration_id
                AND tbs.tournament_id = tr.tournament_id
              WHERE tr.tournament_id = ?
              AND tr.status = ?
              ORDER BY tbs.seed_number ASC, tr.registration_id ASC
              FOR UPDATE
            `,
            [tournamentId, TOURNAMENT_REGISTRATION_STATUS_REGISTERED]
          );

          const activeRegistrationCount = registrationRows.length;
          const seededCount = registrationRows.filter(
            (row) => Number(row.seed_number || 0) > 0
          ).length;

          if (!canHandoffTournamentToBrackets(tournament, activeRegistrationCount, seededCount)) {
            const error = new Error(
              "Tournament handoff requires at least two active registrations and a complete seeding board."
            );
            error.statusCode = 400;
            throw error;
          }

          const eligibleRegistrations = registrationRows.filter(
            (row) =>
              normalizeTournamentAttendanceStatus(row.attendance_status) !==
              TOURNAMENT_ATTENDANCE_STATUS_NO_SHOW
          );

          if (eligibleRegistrations.length < 2) {
            const error = new Error(
              "At least two eligible registrations are required after no-show exclusions."
            );
            error.statusCode = 400;
            throw error;
          }

          await resetTournamentBracketIfEditable(connection, tournamentId);

          const bracket = createSingleEliminationBracket(
            eligibleRegistrations.map((registration) => ({
              registration_id: registration.registration_id,
              seed_number: registration.seed_number,
            }))
          );

          if (!Array.isArray(bracket.matches) || !bracket.matches.length) {
            const error = new Error(
              "Unable to generate a bracket from the current seeded field."
            );
            error.statusCode = 400;
            throw error;
          }

          await replaceTournamentBracketMatches(connection, tournamentId, bracket);

          const updatedTournament = await getTournamentRow(connection, tournamentId);
          const notificationBatch = await createTournamentNotificationCampaignWithDeliveries(
            connection,
            {
              tournamentId,
              eventType: TOURNAMENT_NOTIFICATION_EVENT_BRACKET_READY,
              recipientScope: TOURNAMENT_NOTIFICATION_SCOPE_ELIGIBLE_BRACKET,
              title: `${tournament.title} bracket is live`,
              message:
                "Your seeded matchup is ready. Open the tournament page to review the live bracket and your round path.",
              createdBy: getAdminActorId(req),
              sendEmail: true,
              recipients: filterTournamentNotificationRecipients(
                await getTournamentNotificationRecipients(connection, tournamentId),
                TOURNAMENT_NOTIFICATION_SCOPE_ELIGIBLE_BRACKET
              ),
            }
          );

          return {
            tournament: updatedTournament,
            bracket: await getTournamentBracketPayload(tournamentId, connection),
            emailJobs: notificationBatch.emailJobs,
          };
        });

        await dispatchTournamentNotificationEmails(result.emailJobs);

        return res.json({
          message: "Bracket generated and ready for match reporting.",
          tournament: serializeTournament(result.tournament),
          bracket: result.bracket,
        });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  router.post(
    "/admin/:id/bracket/matches/:matchId/result",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      const tournamentId = Number(req.params.id || 0);
      const matchId = Number(req.params.matchId || 0);
      const winnerRegistrationId = Number(req.body?.winner_registration_id || 0);
      const slotOneScore = normalizeOptionalMatchScore(req.body?.slot_one_score);
      const slotTwoScore = normalizeOptionalMatchScore(req.body?.slot_two_score);
      const notes = String(req.body?.notes || "").trim().slice(0, 255);

      if (!tournamentId || !matchId) {
        return res.status(400).json({ error: "Tournament id and match id are required." });
      }

      if (!winnerRegistrationId) {
        return res.status(400).json({ error: "Winner registration id is required." });
      }

      if (
        (req.body?.slot_one_score !== undefined &&
          req.body?.slot_one_score !== null &&
          req.body?.slot_one_score !== "" &&
          slotOneScore === null) ||
        (req.body?.slot_two_score !== undefined &&
          req.body?.slot_two_score !== null &&
          req.body?.slot_two_score !== "" &&
          slotTwoScore === null)
      ) {
        return res.status(400).json({ error: "Match scores must be whole numbers or blank." });
      }

      try {
        const result = await withTransaction(async (connection) => {
          const tournament = await getTournamentRow(connection, tournamentId, { forUpdate: true });

          if (!tournament) {
            const error = new Error("Tournament not found.");
            error.statusCode = 404;
            throw error;
          }

          assertMutableTournament(
            tournament,
            "This tournament can no longer accept match results."
          );

          const [matchRows] = await connection.query(
            `
              SELECT *
              FROM tournament_bracket_matches
              WHERE tournament_id = ?
              AND match_id = ?
              LIMIT 1
              FOR UPDATE
            `,
            [tournamentId, matchId]
          );

          const match = matchRows[0];
          if (!match) {
            const error = new Error("Bracket match not found.");
            error.statusCode = 404;
            throw error;
          }

          if (normalizeTournamentMatchStatus(match.status) !== TOURNAMENT_MATCH_STATUS_PENDING) {
            const error = new Error("This bracket match has already been resolved.");
            error.statusCode = 400;
            throw error;
          }

          const slotOneRegistrationId = Number(match.slot_one_registration_id || 0) || null;
          const slotTwoRegistrationId = Number(match.slot_two_registration_id || 0) || null;

          if (!slotOneRegistrationId || !slotTwoRegistrationId) {
            const error = new Error(
              "Both bracket sides must be locked before a match result can be reported."
            );
            error.statusCode = 400;
            throw error;
          }

          if (
            winnerRegistrationId !== slotOneRegistrationId &&
            winnerRegistrationId !== slotTwoRegistrationId
          ) {
            const error = new Error(
              "Winner must be one of the two registrations currently assigned to this match."
            );
            error.statusCode = 400;
            throw error;
          }

          await connection.query(
            `
              UPDATE tournament_bracket_matches
              SET
                slot_one_score = ?,
                slot_two_score = ?,
                winner_registration_id = ?,
                loser_registration_id = ?,
                status = ?,
                notes = ?,
                completed_at = NOW(),
                reported_by = ?,
                updated_at = NOW()
              WHERE tournament_id = ?
              AND match_id = ?
            `,
            [
              slotOneScore,
              slotTwoScore,
              winnerRegistrationId,
              winnerRegistrationId === slotOneRegistrationId
                ? slotTwoRegistrationId
                : slotOneRegistrationId,
              TOURNAMENT_MATCH_STATUS_COMPLETED,
              notes || null,
              getAdminActorId(req),
              tournamentId,
              matchId,
            ]
          );

          await propagateTournamentBracketResolution(connection, tournamentId, matchId);

          const updatedTournament = await getTournamentRow(connection, tournamentId);
          const bracketPayload = await getTournamentBracketPayload(tournamentId, connection);
          const notificationRecipients = await getTournamentNotificationRecipients(
            connection,
            tournamentId,
            {
              includeCancelled: true,
            }
          );
          const matchParticipants = notificationRecipients.filter((recipient) =>
            [slotOneRegistrationId, slotTwoRegistrationId].includes(
              Number(recipient.registration_id || 0)
            )
          );
          const matchNotificationBatch = await createTournamentNotificationCampaignWithDeliveries(
            connection,
            {
              tournamentId,
              eventType: TOURNAMENT_NOTIFICATION_EVENT_MATCH_RESULT,
              recipientScope: "match_players",
              title: `${tournament.title} match result`,
              message: `A ${getTournamentBracketRoundLabel(
                match.round_number,
                bracketPayload.round_count || match.round_number
              )} result has been reported.`,
              createdBy: getAdminActorId(req),
              sendEmail: true,
              recipients: matchParticipants,
              buildRecipientNotification: (recipient) => {
                const isWinner =
                  Number(recipient.registration_id || 0) === winnerRegistrationId;
                const roundLabel = getTournamentBracketRoundLabel(
                  match.round_number,
                  bracketPayload.round_count || match.round_number
                );

                return {
                  title: isWinner
                    ? `${tournament.title}: round won`
                    : `${tournament.title}: bracket update`,
                  message: isWinner
                    ? `You won ${roundLabel} match ${match.match_number} and advanced to the next round.`
                    : `Your run in ${tournament.title} ended in ${roundLabel} match ${match.match_number}.`,
                };
              },
            }
          );
          let championNotificationBatch = {
            emailJobs: [],
          };

          if (
            Number(bracketPayload.match_count || 0) > 0 &&
            Number(bracketPayload.completed_match_count || 0) >=
              Number(bracketPayload.match_count || 0) &&
            bracketPayload.champion_registration_id
          ) {
            championNotificationBatch = await createTournamentNotificationCampaignWithDeliveries(
              connection,
              {
                tournamentId,
                eventType: TOURNAMENT_NOTIFICATION_EVENT_CHAMPION,
                recipientScope: TOURNAMENT_NOTIFICATION_SCOPE_ALL_REGISTERED,
                title: `${tournament.title} champion crowned`,
                message: `${
                  bracketPayload.champion?.display_name || "The final winner"
                } has won the live tournament bracket.`,
                createdBy: getAdminActorId(req),
                sendEmail: true,
                recipients: filterTournamentNotificationRecipients(
                  notificationRecipients,
                  TOURNAMENT_NOTIFICATION_SCOPE_ALL_REGISTERED
                ),
              }
            );
          }

          return {
            tournament: updatedTournament,
            bracket: bracketPayload,
            emailJobs: [
              ...matchNotificationBatch.emailJobs,
              ...championNotificationBatch.emailJobs,
            ],
          };
        });

        await dispatchTournamentNotificationEmails(result.emailJobs);

        const updatedMatch = result.bracket.rounds
          .flatMap((round) => round.matches)
          .find((match) => Number(match.match_id || 0) === matchId);

        return res.json({
          message: "Match result recorded.",
          tournament: serializeTournament(result.tournament),
          bracket: result.bracket,
          match: updatedMatch || null,
        });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );
}

module.exports = {
  registerTournamentAdminOperationsRoutes,
};
