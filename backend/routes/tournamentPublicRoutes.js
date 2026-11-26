const auth = require("../middleware/auth");
const { query } = require("../utils/db");
const { listTournamentLeaderboard } = require("../utils/tournamentCommunity");
const {
  TOURNAMENT_COMMUNITY_POST_STATUS_PUBLISHED,
  isTournamentCommunityPostActiveNow,
  serializeTournamentCommunityPost,
} = require("../utils/tournamentContent");
const {
  TOURNAMENT_REGISTRATION_STATUS_REGISTERED,
  TOURNAMENT_REGISTRATION_STATUS_WAITLISTED,
  TOURNAMENT_STATUS_COMPLETED,
  TOURNAMENT_STATUS_PUBLISHED,
  serializeTournament,
} = require("../utils/tournaments");
const {
  buildPublicOrderSql,
  buildTournamentCommunityPostFields,
  buildTournamentRegistrationProjection,
  buildTournamentSelectFields,
  getAuthenticatedUserId,
} = require("./tournamentRouteSupport");
const { sortRegistrationsForBracketOps } = require("./tournamentBracketSupport");
const { getTournamentBracketPayload } = require("./tournamentBracketPersistenceSupport");
const { attachRegistrationRelations } = require("./tournamentRegistrationSupport");

function registerTournamentPublicRoutes(router) {
  router.get("/all", async (req, res) => {
    const requestedBusinessId = Number(req.query?.business_id || 0);
    const businessId =
      Number.isInteger(requestedBusinessId) && requestedBusinessId > 0
        ? requestedBusinessId
        : 0;

    try {
      const businessFilterSql = businessId ? "AND business_id = ?" : "";
      const rows = await query(
        `
          SELECT ${buildTournamentSelectFields()}
          FROM tournaments
          WHERE status = ?
          ${businessFilterSql}
          ${buildPublicOrderSql()}
        `,
        businessId
          ? [TOURNAMENT_STATUS_PUBLISHED, businessId]
          : [TOURNAMENT_STATUS_PUBLISHED]
      );

      res.json(rows.map(serializeTournament));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/my", auth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({ error: "User token required." });
    }

    try {
      const rows = await query(
        `
          SELECT
            ${buildTournamentSelectFields("t")},
            ${buildTournamentRegistrationProjection("tr")}
          FROM tournament_registrations tr
          JOIN tournaments t ON t.tournament_id = tr.tournament_id
          WHERE tr.user_id = ?
          AND tr.status IN (?, ?)
          ORDER BY
            CASE WHEN t.start_at >= NOW() THEN 0 ELSE 1 END ASC,
            CASE WHEN t.start_at >= NOW() THEN t.start_at END ASC,
            CASE WHEN t.start_at < NOW() THEN t.start_at END DESC,
            tr.registration_id DESC
        `,
        [
          userId,
          TOURNAMENT_REGISTRATION_STATUS_REGISTERED,
          TOURNAMENT_REGISTRATION_STATUS_WAITLISTED,
        ]
      );

      const withRelations = await attachRegistrationRelations(rows);
      res.json(sortRegistrationsForBracketOps(withRelations).map(serializeTournament));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/leaderboard", async (req, res) => {
    const limit = Number(req.query?.limit || 10);

    try {
      const leaderboard = await listTournamentLeaderboard({ limit });
      return res.json(leaderboard);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get("/community", async (req, res) => {
    const requestedLimit = Number(req.query?.limit || 8);
    const limit = Math.max(1, Math.min(20, requestedLimit || 8));

    try {
      const rows = await query(
        `
          SELECT ${buildTournamentCommunityPostFields("tcp", "lt")},
            (SELECT COUNT(*) FROM tournament_community_reactions tcr
             WHERE tcr.post_id = tcp.post_id) AS reaction_count
          FROM tournament_community_posts tcp
          LEFT JOIN tournaments lt
            ON lt.tournament_id = tcp.linked_tournament_id
            AND lt.status = ?
            AND lt.published_at IS NOT NULL
          WHERE tcp.status = ?
          AND tcp.published_at IS NOT NULL
          AND (tcp.starts_at IS NULL OR tcp.starts_at <= NOW())
          AND (tcp.ends_at IS NULL OR tcp.ends_at >= NOW())
          ORDER BY
            tcp.priority DESC,
            COALESCE(tcp.published_at, tcp.updated_at) DESC,
            tcp.post_id DESC
          LIMIT ?
        `,
        [TOURNAMENT_STATUS_PUBLISHED, TOURNAMENT_COMMUNITY_POST_STATUS_PUBLISHED, limit]
      );

      const posts = rows
        .filter(
          (row) => Boolean(row.published_at) && isTournamentCommunityPostActiveNow(row)
        )
        .map((row) => {
          const post = serializeTournamentCommunityPost(row);

          if (!row.linked_tournament_tournament_id) {
            post.linked_tournament_id = null;
            post.linked_tournament = null;
          }

          return post;
        });

      return res.json(posts);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get("/highlights", async (req, res) => {
    const requestedLimit = Number(req.query?.limit || 8);
    const limit = Math.max(1, Math.min(24, Number.isFinite(requestedLimit) ? requestedLimit : 8));

    try {
      const rows = await query(
        `
          SELECT tbm.match_id, tbm.tournament_id, tbm.round_number,
            tbm.match_number, tbm.slot_one_score, tbm.slot_two_score,
            tbm.status AS match_status, tbm.completed_at,
            t.title AS tournament_title, t.slug AS tournament_slug,
            t.game_title, t.location_label, t.start_at,
            COALESCE(winner.team_name, winner.participant_name, 'Winner') AS winner_name,
            COALESCE(loser.team_name, loser.participant_name, 'Runner-up') AS runner_up_name,
            CASE WHEN tbm.winner_registration_id = tbm.slot_one_registration_id
              THEN tbm.slot_one_score ELSE tbm.slot_two_score END AS winner_score,
            CASE WHEN tbm.winner_registration_id = tbm.slot_one_registration_id
              THEN tbm.slot_two_score ELSE tbm.slot_one_score END AS runner_up_score
          FROM tournament_bracket_matches tbm
          JOIN tournaments t ON t.tournament_id = tbm.tournament_id
          JOIN tournament_registrations winner
            ON winner.registration_id = tbm.winner_registration_id
          LEFT JOIN tournament_registrations loser
            ON loser.registration_id = tbm.loser_registration_id
          WHERE t.status IN (?, ?)
            AND t.published_at IS NOT NULL
            AND tbm.status IN ('completed', 'walkover')
            AND tbm.winner_registration_id IS NOT NULL
          ORDER BY COALESCE(tbm.completed_at, tbm.updated_at) DESC, tbm.match_id DESC
          LIMIT ?
        `,
        [TOURNAMENT_STATUS_PUBLISHED, TOURNAMENT_STATUS_COMPLETED, limit]
      );

      return res.json(rows.map((row) => ({
        match_id: Number(row.match_id || 0),
        tournament_id: Number(row.tournament_id || 0),
        tournament_title: row.tournament_title || "Tournament",
        tournament_slug: row.tournament_slug || "",
        game_title: row.game_title || "",
        location_label: row.location_label || "",
        tournament_start_at: row.start_at || null,
        round_number: Number(row.round_number || 0),
        match_number: Number(row.match_number || 0),
        match_status: row.match_status || "completed",
        completed_at: row.completed_at || null,
        winner_name: row.winner_name || "Winner",
        runner_up_name: row.runner_up_name || "Runner-up",
        winner_score: row.winner_score == null ? null : Number(row.winner_score),
        runner_up_score: row.runner_up_score == null ? null : Number(row.runner_up_score),
      })));
    } catch (error) {
      return res.status(500).json({ error: error.message || "Unable to load recent match highlights." });
    }
  });

  router.get("/details/:slugOrId", async (req, res) => {
    const slugOrId = String(req.params.slugOrId || "").trim();
    const numericId = Number(slugOrId || 0);

    try {
      const rows = await query(
        `
          SELECT ${buildTournamentSelectFields()}
          FROM tournaments
          WHERE status = ?
          AND (slug = ? OR tournament_id = ?)
          LIMIT 1
        `,
        [TOURNAMENT_STATUS_PUBLISHED, slugOrId, numericId || 0]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "Tournament not found." });
      }

      return res.json(serializeTournament(rows[0]));
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get("/:id/bracket", async (req, res) => {
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
          AND status IN (?, ?)
          LIMIT 1
        `,
        [tournamentId, TOURNAMENT_STATUS_PUBLISHED, TOURNAMENT_STATUS_COMPLETED]
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
  });
}

module.exports = {
  registerTournamentPublicRoutes,
};
