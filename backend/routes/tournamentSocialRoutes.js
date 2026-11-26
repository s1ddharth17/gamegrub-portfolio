const auth = require("../middleware/auth");
const { query } = require("../utils/db");
const { attachTournamentProfilesToUsers } = require("../utils/tournamentCommunity");
const { normalizeTournamentSkillLevel } = require("../utils/tournaments");
const { getAuthenticatedUserId } = require("./tournamentRouteSupport");

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function serializePlayer(row) {
  return {
    user_id: Number(row.uid || row.user_id || 0),
    display_name: String(row.display_name || row.gamer_tag || row.name || "Player"),
    gamer_tag: String(row.gamer_tag || ""),
    avatar: String(row.avatar || ""),
    favorite_game: String(row.favorite_game || ""),
    player_bio: String(row.player_bio || ""),
    city: String(row.city || ""),
    state: String(row.state || ""),
    skill_level: normalizeTournamentSkillLevel(row.profile_skill_level),
    looking_for_team: Boolean(Number(row.looking_for_team || 0)),
    tournament_entries: Number(row.tournament_entries || 0),
    tournament_rank: row.tournament_rank == null ? null : Number(row.tournament_rank),
    tournament_points: Number(row.tournament_points || 0),
    tournament_championships: Number(row.tournament_championships || 0),
    tournament_matches_played: Number(row.tournament_matches_played || 0),
    tournament_match_wins: Number(row.tournament_match_wins || 0),
    tournament_win_rate: Number(row.tournament_win_rate || 0),
  };
}

async function getPublicPlayers({ filters = {}, userId = null } = {}) {
  const clauses = ["tp.is_public = 1"];
  const params = [];
  const game = String(filters.game || "").trim().slice(0, 120);
  const city = String(filters.city || "").trim().slice(0, 120);
  const state = String(filters.state || "").trim().slice(0, 120);
  const skill = String(filters.skill_level || "").trim().toLowerCase();
  const looking = parseBoolean(filters.looking_for_team, false);

  if (userId) {
    clauses.push("u.uid = ?");
    params.push(userId);
  }
  if (game) {
    clauses.push("LOWER(COALESCE(u.favorite_game, '')) LIKE ?");
    params.push(`%${game.toLowerCase()}%`);
  }
  if (city) {
    clauses.push("LOWER(COALESCE(tp.city, '')) = ?");
    params.push(city.toLowerCase());
  }
  if (state) {
    clauses.push("LOWER(COALESCE(tp.state, '')) = ?");
    params.push(state.toLowerCase());
  }
  if (skill && skill !== "all") {
    const normalizedSkill = normalizeTournamentSkillLevel(skill, "");
    if (!normalizedSkill) return [];
    clauses.push("tp.skill_level IN (?, 'open')");
    params.push(normalizedSkill);
  }
  if (looking) clauses.push("tp.looking_for_team = 1");

  const limit = Math.max(1, Math.min(40, Number(filters.limit || 24) || 24));
  const rows = await query(
    `
      SELECT u.uid, u.name, COALESCE(u.gamer_tag, '') AS gamer_tag,
        COALESCE(u.avatar, '') AS avatar,
        COALESCE(u.favorite_game, '') AS favorite_game,
        COALESCE(u.player_bio, '') AS player_bio,
        tp.city, tp.state, tp.skill_level AS profile_skill_level,
        tp.looking_for_team
      FROM tournament_player_profiles tp
      JOIN users u ON u.uid = tp.user_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY tp.looking_for_team DESC, tp.updated_at DESC, u.uid ASC
      LIMIT ?
    `,
    [...params, limit]
  );
  const enriched = await attachTournamentProfilesToUsers(rows);
  return enriched.map(serializePlayer);
}

function registerTournamentSocialRoutes(router) {
  router.get("/players", async (req, res) => {
    try {
      const players = await getPublicPlayers({ filters: req.query || {} });
      return res.json(players);
    } catch (error) {
      return res.status(500).json({ error: error.message || "Unable to find players." });
    }
  });

  router.get("/players/:id", async (req, res) => {
    const userId = Number(req.params.id || 0);
    if (!userId) return res.status(400).json({ error: "Player id is required." });

    try {
      const players = await getPublicPlayers({ userId, filters: { limit: 1 } });
      if (!players.length) return res.status(404).json({ error: "Public player profile not found." });
      return res.json(players[0]);
    } catch (error) {
      return res.status(500).json({ error: error.message || "Unable to load player profile." });
    }
  });

  router.get("/player-profile", auth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: "User token required." });

    try {
      const rows = await query(
        `
          SELECT u.uid, COALESCE(u.name, '') AS name,
            COALESCE(u.gamer_tag, '') AS gamer_tag,
            COALESCE(u.favorite_game, '') AS favorite_game,
            COALESCE(tp.is_public, 0) AS is_public,
            COALESCE(tp.looking_for_team, 0) AS looking_for_team,
            COALESCE(tp.skill_level, 'open') AS skill_level,
            COALESCE(tp.city, '') AS city, COALESCE(tp.state, '') AS state
          FROM users u
          LEFT JOIN tournament_player_profiles tp ON tp.user_id = u.uid
          WHERE u.uid = ? LIMIT 1
        `,
        [userId]
      );
      if (!rows.length) return res.status(404).json({ error: "User not found." });
      const row = rows[0];
      return res.json({
        is_public: Boolean(Number(row.is_public || 0)),
        looking_for_team: Boolean(Number(row.looking_for_team || 0)),
        skill_level: normalizeTournamentSkillLevel(row.skill_level),
        city: String(row.city || ""),
        state: String(row.state || ""),
        display_name: String(row.gamer_tag || row.name || "Player"),
        favorite_game: String(row.favorite_game || ""),
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || "Unable to load player settings." });
    }
  });

  router.put("/player-profile", auth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    if (!userId) return res.status(401).json({ error: "User token required." });

    const isPublic = parseBoolean(req.body?.is_public, false);
    const lookingForTeam = isPublic && parseBoolean(req.body?.looking_for_team, false);
    const skillLevel = normalizeTournamentSkillLevel(req.body?.skill_level, "");
    const city = String(req.body?.city || "").trim().slice(0, 120);
    const state = String(req.body?.state || "").trim().slice(0, 120);
    if (!skillLevel) return res.status(400).json({ error: "Choose a valid skill level." });

    try {
      await query(
        `
          INSERT INTO tournament_player_profiles (
            user_id, is_public, looking_for_team, skill_level, city, state
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            is_public = VALUES(is_public),
            looking_for_team = VALUES(looking_for_team),
            skill_level = VALUES(skill_level),
            city = VALUES(city),
            state = VALUES(state),
            updated_at = NOW()
        `,
        [userId, isPublic ? 1 : 0, lookingForTeam ? 1 : 0, skillLevel, city || null, state || null]
      );
      return res.json({
        message: isPublic ? "Your public tournament profile is saved." : "Player discovery is off.",
        is_public: isPublic,
        looking_for_team: lookingForTeam,
        skill_level: skillLevel,
        city,
        state,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message || "Unable to save player profile." });
    }
  });
}

module.exports = { getPublicPlayers, registerTournamentSocialRoutes, serializePlayer };
