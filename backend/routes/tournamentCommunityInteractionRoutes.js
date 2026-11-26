const auth = require("../middleware/auth");
const { query, withTransaction } = require("../utils/db");
const { getAuthenticatedUserId } = require("./tournamentRouteSupport");

const COMMUNITY_REPORT_REASONS = new Set(["spam", "abuse", "hate", "other"]);

function registerTournamentCommunityInteractionRoutes(router) {
  router.post("/community/:id/reaction", auth, async (req, res) => {
    const postId = Number(req.params.id || 0);
    const userId = getAuthenticatedUserId(req);
    if (!postId) return res.status(400).json({ error: "Post id is required." });
    if (!userId) return res.status(401).json({ error: "User token required." });

    try {
      const result = await withTransaction(async (connection) => {
        const [posts] = await connection.query(
          `SELECT post_id FROM tournament_community_posts
           WHERE post_id = ? AND status = 'published' AND published_at IS NOT NULL
             AND (starts_at IS NULL OR starts_at <= NOW())
             AND (ends_at IS NULL OR ends_at >= NOW())
           FOR UPDATE`,
          [postId]
        );
        if (!posts.length) {
          const error = new Error("Community post not found.");
          error.statusCode = 404;
          throw error;
        }

        const [existing] = await connection.query(
          "SELECT reaction_id FROM tournament_community_reactions WHERE post_id = ? AND user_id = ? LIMIT 1",
          [postId, userId]
        );
        const liked = !existing.length;
        if (liked) {
          await connection.query(
            "INSERT INTO tournament_community_reactions (post_id, user_id, reaction, created_at) VALUES (?, ?, 'like', NOW())",
            [postId, userId]
          );
        } else {
          await connection.query(
            "DELETE FROM tournament_community_reactions WHERE post_id = ? AND user_id = ?",
            [postId, userId]
          );
        }
        const [counts] = await connection.query(
          "SELECT COUNT(*) AS reaction_count FROM tournament_community_reactions WHERE post_id = ?",
          [postId]
        );
        return { liked, reaction_count: Number(counts[0]?.reaction_count || 0) };
      });
      return res.json(result);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || "Unable to save reaction." });
    }
  });

  router.post("/community/:id/report", auth, async (req, res) => {
    const postId = Number(req.params.id || 0);
    const userId = getAuthenticatedUserId(req);
    const reason = String(req.body?.reason || "").trim().toLowerCase();
    const details = String(req.body?.details || "").trim().slice(0, 500);
    if (!postId) return res.status(400).json({ error: "Post id is required." });
    if (!userId) return res.status(401).json({ error: "User token required." });
    if (!COMMUNITY_REPORT_REASONS.has(reason)) {
      return res.status(400).json({ error: "Choose spam, abuse, hate, or other." });
    }

    try {
      await withTransaction(async (connection) => {
        const [posts] = await connection.query(
          `SELECT post_id FROM tournament_community_posts
           WHERE post_id = ? AND status = 'published' AND published_at IS NOT NULL
             AND (starts_at IS NULL OR starts_at <= NOW())
             AND (ends_at IS NULL OR ends_at >= NOW())
           LIMIT 1`,
          [postId]
        );
        if (!posts.length) {
          const error = new Error("Community post not found.");
          error.statusCode = 404;
          throw error;
        }
        const [existing] = await connection.query(
          "SELECT report_id FROM tournament_community_reports WHERE post_id = ? AND user_id = ? LIMIT 1",
          [postId, userId]
        );
        if (existing.length) {
          const error = new Error("You have already reported this post.");
          error.statusCode = 409;
          throw error;
        }
        await connection.query(
          `INSERT INTO tournament_community_reports (post_id, user_id, reason, details, status, created_at)
           VALUES (?, ?, ?, ?, 'pending', NOW())`,
          [postId, userId, reason, details || null]
        );
      });
      return res.status(201).json({ message: "Report submitted for review." });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ error: "You have already reported this post." });
      }
      return res.status(error.statusCode || 500).json({ error: error.message || "Unable to submit report." });
    }
  });
}

module.exports = { COMMUNITY_REPORT_REASONS, registerTournamentCommunityInteractionRoutes };
