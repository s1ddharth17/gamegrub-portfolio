const adminAuth = require("../middleware/adminAuth");
const { ADMIN_PERMISSIONS } = require("../utils/adminAccess");
const { query, withTransaction } = require("../utils/db");
const {
  TOURNAMENT_COMMUNITY_POST_STATUS_ARCHIVED,
  TOURNAMENT_COMMUNITY_POST_STATUS_DRAFT,
  TOURNAMENT_COMMUNITY_POST_STATUS_PUBLISHED,
  parseTournamentCommunityPostInput,
  serializeTournamentCommunityPost,
} = require("../utils/tournamentContent");
const {
  buildTournamentCommunityPostFields,
  getTournamentCommunityPostById,
} = require("./tournamentRouteSupport");

async function ensureLinkedTournamentExists(connection, linkedTournamentId) {
  if (!linkedTournamentId) {
    return;
  }

  const [linkedTournamentRows] = await connection.query(
    `
      SELECT tournament_id
      FROM tournaments
      WHERE tournament_id = ?
      LIMIT 1
    `,
    [linkedTournamentId]
  );

  if (!linkedTournamentRows.length) {
    const error = new Error("Linked tournament not found.");
    error.statusCode = 404;
    throw error;
  }
}

function registerTournamentCommunityAdminRoutes(router) {
  router.get(
    "/admin/community/reports",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      const requestedStatus = String(req.query?.status || "pending").trim().toLowerCase();
      const status = ["pending", "dismissed", "actioned"].includes(requestedStatus)
        ? requestedStatus
        : "pending";
      try {
        const rows = await query(
          `SELECT r.report_id, r.post_id, r.user_id, r.reason, r.details,
              r.status, r.moderated_by, r.moderation_note, r.created_at, r.moderated_at,
              p.title AS post_title, p.summary AS post_summary, p.status AS post_status,
              u.name AS reporter_name
           FROM tournament_community_reports r
           JOIN tournament_community_posts p ON p.post_id = r.post_id
           LEFT JOIN users u ON u.uid = r.user_id
           WHERE r.status = ?
           ORDER BY r.created_at ASC, r.report_id ASC
           LIMIT 100`,
          [status]
        );
        return res.json({ reports: rows });
      } catch (error) {
        return res.status(500).json({ error: error.message || "Unable to load community reports." });
      }
    }
  );

  router.post(
    "/admin/community/reports/:id/review",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      const reportId = Number(req.params.id || 0);
      const action = String(req.body?.action || "").trim().toLowerCase();
      const note = String(req.body?.moderation_note || "").trim().slice(0, 500);
      if (!reportId) return res.status(400).json({ error: "Report id is required." });
      if (!["dismiss", "remove"].includes(action)) {
        return res.status(400).json({ error: "Choose dismiss or remove." });
      }

      try {
        await withTransaction(async (connection) => {
          const [rows] = await connection.query(
            "SELECT report_id, post_id, status FROM tournament_community_reports WHERE report_id = ? FOR UPDATE",
            [reportId]
          );
          if (!rows.length) {
            const error = new Error("Community report not found.");
            error.statusCode = 404;
            throw error;
          }
          if (rows[0].status !== "pending") {
            const error = new Error("This report has already been reviewed.");
            error.statusCode = 409;
            throw error;
          }
          const nextStatus = action === "remove" ? "actioned" : "dismissed";
          await connection.query(
            `UPDATE tournament_community_reports
             SET status = ?, moderated_by = ?, moderation_note = ?, moderated_at = NOW()
             WHERE report_id = ?`,
            [nextStatus, Number(req.admin?.id || 0) || null, note || null, reportId]
          );
          if (action === "remove") {
            await connection.query(
              "UPDATE tournament_community_posts SET status = ?, updated_at = NOW() WHERE post_id = ?",
              [TOURNAMENT_COMMUNITY_POST_STATUS_ARCHIVED, rows[0].post_id]
            );
          }
        });
        return res.json({ message: action === "remove" ? "Post archived and report actioned." : "Report dismissed." });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message || "Unable to review report." });
      }
    }
  );

  router.get(
    "/admin/community",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      try {
        const rows = await query(
          `
            SELECT ${buildTournamentCommunityPostFields("tcp", "lt")}
            FROM tournament_community_posts tcp
            LEFT JOIN tournaments lt ON lt.tournament_id = tcp.linked_tournament_id
            ORDER BY
              FIELD(
                tcp.status,
                '${TOURNAMENT_COMMUNITY_POST_STATUS_PUBLISHED}',
                '${TOURNAMENT_COMMUNITY_POST_STATUS_DRAFT}',
                '${TOURNAMENT_COMMUNITY_POST_STATUS_ARCHIVED}'
              ),
              tcp.priority DESC,
              COALESCE(tcp.published_at, tcp.updated_at) DESC,
              tcp.post_id DESC
          `
        );

        return res.json({
          posts: rows.map(serializeTournamentCommunityPost),
        });
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }
  );

  router.post(
    "/admin/community",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      try {
        const post = await withTransaction(async (connection) => {
          const parsed = parseTournamentCommunityPostInput(req.body);

          if (parsed.errors.length) {
            const error = new Error(parsed.errors.join(" "));
            error.statusCode = 400;
            throw error;
          }

          await ensureLinkedTournamentExists(connection, parsed.data.linked_tournament_id);

          const initialStatus = parsed.data.status || TOURNAMENT_COMMUNITY_POST_STATUS_DRAFT;
          const [result] = await connection.query(
            `
              INSERT INTO tournament_community_posts (
                linked_tournament_id,
                content_type,
                status,
                accent_tone,
                title,
                subtitle,
                summary,
                body,
                badge_label,
                cta_label,
                priority,
                starts_at,
                ends_at,
                published_at,
                created_by,
                created_at,
                updated_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `,
            [
              parsed.data.linked_tournament_id,
              parsed.data.content_type,
              initialStatus,
              parsed.data.accent_tone,
              parsed.data.title,
              parsed.data.subtitle || null,
              parsed.data.summary,
              parsed.data.body || null,
              parsed.data.badge_label || null,
              parsed.data.cta_label || null,
              parsed.data.priority,
              parsed.data.starts_at,
              parsed.data.ends_at,
              initialStatus === TOURNAMENT_COMMUNITY_POST_STATUS_PUBLISHED ? new Date() : null,
              Number(req.admin?.id || 0) || null,
            ]
          );

          return getTournamentCommunityPostById(result.insertId, connection);
        });

        return res.json({
          message:
            post?.status === TOURNAMENT_COMMUNITY_POST_STATUS_PUBLISHED
              ? "Community post published."
              : "Community post saved.",
          post: post ? serializeTournamentCommunityPost(post) : null,
        });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  router.put(
    "/admin/community/:id",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      const postId = Number(req.params.id || 0);

      if (!postId) {
        return res.status(400).json({ error: "Post id is required." });
      }

      try {
        const post = await withTransaction(async (connection) => {
          const existingPost = await getTournamentCommunityPostById(postId, connection, {
            forUpdate: true,
          });

          if (!existingPost) {
            const error = new Error("Community post not found.");
            error.statusCode = 404;
            throw error;
          }

          const parsed = parseTournamentCommunityPostInput(req.body);

          if (parsed.errors.length) {
            const error = new Error(parsed.errors.join(" "));
            error.statusCode = 400;
            throw error;
          }

          await ensureLinkedTournamentExists(connection, parsed.data.linked_tournament_id);

          await connection.query(
            `
              UPDATE tournament_community_posts
              SET
                linked_tournament_id = ?,
                content_type = ?,
                status = ?,
                accent_tone = ?,
                title = ?,
                subtitle = ?,
                summary = ?,
                body = ?,
                badge_label = ?,
                cta_label = ?,
                priority = ?,
                starts_at = ?,
                ends_at = ?,
                published_at = CASE
                  WHEN ? = '${TOURNAMENT_COMMUNITY_POST_STATUS_PUBLISHED}'
                  THEN COALESCE(published_at, NOW())
                  ELSE published_at
                END,
                updated_at = NOW()
              WHERE post_id = ?
            `,
            [
              parsed.data.linked_tournament_id,
              parsed.data.content_type,
              parsed.data.status || existingPost.status,
              parsed.data.accent_tone,
              parsed.data.title,
              parsed.data.subtitle || null,
              parsed.data.summary,
              parsed.data.body || null,
              parsed.data.badge_label || null,
              parsed.data.cta_label || null,
              parsed.data.priority,
              parsed.data.starts_at,
              parsed.data.ends_at,
              parsed.data.status || existingPost.status,
              postId,
            ]
          );

          return getTournamentCommunityPostById(postId, connection);
        });

        return res.json({
          message: "Community post updated.",
          post: post ? serializeTournamentCommunityPost(post) : null,
        });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  router.post(
    "/admin/community/:id/publish",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      const postId = Number(req.params.id || 0);

      if (!postId) {
        return res.status(400).json({ error: "Post id is required." });
      }

      try {
        const post = await withTransaction(async (connection) => {
          const existingPost = await getTournamentCommunityPostById(postId, connection, {
            forUpdate: true,
          });

          if (!existingPost) {
            const error = new Error("Community post not found.");
            error.statusCode = 404;
            throw error;
          }

          await connection.query(
            `
              UPDATE tournament_community_posts
              SET
                status = ?,
                published_at = COALESCE(published_at, NOW()),
                updated_at = NOW()
              WHERE post_id = ?
            `,
            [TOURNAMENT_COMMUNITY_POST_STATUS_PUBLISHED, postId]
          );

          return getTournamentCommunityPostById(postId, connection);
        });

        return res.json({
          message: "Community post published.",
          post: post ? serializeTournamentCommunityPost(post) : null,
        });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );

  router.post(
    "/admin/community/:id/archive",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.TOURNAMENTS_MANAGE),
    async (req, res) => {
      const postId = Number(req.params.id || 0);

      if (!postId) {
        return res.status(400).json({ error: "Post id is required." });
      }

      try {
        const post = await withTransaction(async (connection) => {
          const existingPost = await getTournamentCommunityPostById(postId, connection, {
            forUpdate: true,
          });

          if (!existingPost) {
            const error = new Error("Community post not found.");
            error.statusCode = 404;
            throw error;
          }

          await connection.query(
            `
              UPDATE tournament_community_posts
              SET
                status = ?,
                updated_at = NOW()
              WHERE post_id = ?
            `,
            [TOURNAMENT_COMMUNITY_POST_STATUS_ARCHIVED, postId]
          );

          return getTournamentCommunityPostById(postId, connection);
        });

        return res.json({
          message: "Community post archived.",
          post: post ? serializeTournamentCommunityPost(post) : null,
        });
      } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
      }
    }
  );
}

module.exports = {
  registerTournamentCommunityAdminRoutes,
};
