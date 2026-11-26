const { randomBytes, randomUUID, createHash } = require("node:crypto");

const { query, withTransaction } = require("./db");
const { signToken } = require("./security");

const ACTOR_USER = "user";
const ACTOR_ADMIN = "admin";
const REFRESH_TOKEN_TTL_DAYS = Math.max(1, Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30));

let authSessionsTableReady = false;

function hashRefreshToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function generateRefreshToken() {
  return randomBytes(48).toString("base64url");
}

function buildRefreshExpiryDate(fromDate = new Date()) {
  const expiresAt = new Date(fromDate.getTime());
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);
  return expiresAt;
}

function buildAccessToken({ actorId, role, sessionId }) {
  return signToken({
    id: Number(actorId || 0),
    role,
    sid: sessionId,
  });
}

function normalizeIpAddress(value) {
  return String(value || "")
    .split(",")[0]
    .trim()
    .slice(0, 64);
}

function normalizeUserAgent(value) {
  return String(value || "").trim().slice(0, 255);
}

function getRequestSessionMetadata(req) {
  return {
    ipAddress: normalizeIpAddress(
      req.ip || req.headers["x-forwarded-for"] || req.connection?.remoteAddress || ""
    ),
    userAgent: normalizeUserAgent(req.get?.("user-agent") || req.headers["user-agent"] || ""),
  };
}

async function ensureAuthSessionsTableReady() {
  if (authSessionsTableReady) {
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      session_id CHAR(36) NOT NULL UNIQUE,
      actor_type VARCHAR(20) NOT NULL,
      actor_id BIGINT UNSIGNED NOT NULL,
      refresh_token_hash CHAR(64) NOT NULL UNIQUE,
      refresh_expires_at DATETIME NOT NULL,
      user_agent VARCHAR(255) DEFAULT NULL,
      created_ip VARCHAR(64) DEFAULT NULL,
      last_seen_ip VARCHAR(64) DEFAULT NULL,
      last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_refreshed_at DATETIME DEFAULT NULL,
      revoked_at DATETIME DEFAULT NULL,
      revoke_reason VARCHAR(80) DEFAULT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_auth_sessions_actor (actor_type, actor_id, revoked_at)
    )
  `);

  authSessionsTableReady = true;
}

async function createAuthSession({ actorType, actorId, role, ipAddress, userAgent }) {
  await ensureAuthSessionsTableReady();

  const sessionId = randomUUID();
  const refreshToken = generateRefreshToken();
  const refreshExpiresAt = buildRefreshExpiryDate();

  await query(
    `
      INSERT INTO auth_sessions (
        session_id,
        actor_type,
        actor_id,
        refresh_token_hash,
        refresh_expires_at,
        user_agent,
        created_ip,
        last_seen_ip,
        last_used_at,
        last_refreshed_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW(), NOW())
    `,
    [
      sessionId,
      actorType,
      actorId,
      hashRefreshToken(refreshToken),
      refreshExpiresAt,
      normalizeUserAgent(userAgent),
      normalizeIpAddress(ipAddress),
      normalizeIpAddress(ipAddress),
    ]
  );

  return {
    sessionId,
    accessToken: buildAccessToken({ actorId, role, sessionId }),
    refreshToken,
    refreshExpiresAt,
  };
}

async function getActiveAuthSession({ actorType, actorId, sessionId }) {
  await ensureAuthSessionsTableReady();

  const rows = await query(
    `
      SELECT *
      FROM auth_sessions
      WHERE actor_type = ?
      AND actor_id = ?
      AND session_id = ?
      AND revoked_at IS NULL
      LIMIT 1
    `,
    [actorType, actorId, sessionId]
  );

  return rows[0] || null;
}

async function refreshAuthSession({
  actorType,
  refreshToken,
  ipAddress,
  userAgent,
  resolveTokenPayload,
}) {
  await ensureAuthSessionsTableReady();

  return withTransaction(async (connection) => {
    const [rows] = await connection.query(
      `
        SELECT *
        FROM auth_sessions
        WHERE actor_type = ?
        AND refresh_token_hash = ?
        AND revoked_at IS NULL
        LIMIT 1
        FOR UPDATE
      `,
      [actorType, hashRefreshToken(refreshToken)]
    );

    const session = rows[0];
    if (!session) {
      const error = new Error("Invalid refresh token.");
      error.statusCode = 401;
      throw error;
    }

    const refreshExpiresAt = new Date(session.refresh_expires_at);
    if (Number.isNaN(refreshExpiresAt.getTime()) || refreshExpiresAt <= new Date()) {
      await connection.query(
        `
          UPDATE auth_sessions
          SET revoked_at = COALESCE(revoked_at, NOW()),
              revoke_reason = COALESCE(revoke_reason, 'refresh_expired'),
              updated_at = NOW()
          WHERE session_id = ?
        `,
        [session.session_id]
      );

      const error = new Error("Refresh token expired.");
      error.statusCode = 401;
      throw error;
    }

    const payload = await resolveTokenPayload({
      connection,
      actorId: Number(session.actor_id || 0),
      sessionId: session.session_id,
    });

    if (!payload?.id || !payload?.role) {
      await connection.query(
        `
          UPDATE auth_sessions
          SET revoked_at = COALESCE(revoked_at, NOW()),
              revoke_reason = COALESCE(revoke_reason, 'actor_unavailable'),
              updated_at = NOW()
          WHERE session_id = ?
        `,
        [session.session_id]
      );

      const error = new Error("Session actor is no longer available.");
      error.statusCode = 401;
      throw error;
    }

    const nextRefreshToken = generateRefreshToken();
    const nextRefreshExpiresAt = buildRefreshExpiryDate();

    await connection.query(
      `
        UPDATE auth_sessions
        SET
          refresh_token_hash = ?,
          refresh_expires_at = ?,
          user_agent = ?,
          last_seen_ip = ?,
          last_used_at = NOW(),
          last_refreshed_at = NOW(),
          updated_at = NOW()
        WHERE session_id = ?
      `,
      [
        hashRefreshToken(nextRefreshToken),
        nextRefreshExpiresAt,
        normalizeUserAgent(userAgent),
        normalizeIpAddress(ipAddress),
        session.session_id,
      ]
    );

    return {
      actorId: Number(payload.id || 0),
      sessionId: session.session_id,
      accessToken: buildAccessToken({
        actorId: payload.id,
        role: payload.role,
        sessionId: session.session_id,
      }),
      refreshToken: nextRefreshToken,
      refreshExpiresAt: nextRefreshExpiresAt,
    };
  });
}

async function revokeAuthSession({ actorType, actorId, sessionId, reason = "manual_logout" }) {
  await ensureAuthSessionsTableReady();

  await query(
    `
      UPDATE auth_sessions
      SET
        revoked_at = COALESCE(revoked_at, NOW()),
        revoke_reason = ?,
        updated_at = NOW()
      WHERE actor_type = ?
      AND actor_id = ?
      AND session_id = ?
      AND revoked_at IS NULL
    `,
    [reason, actorType, actorId, sessionId]
  );
}

async function revokeActorSessions({
  actorType,
  actorId,
  reason = "actor_sessions_revoked",
  excludeSessionId = null,
}) {
  await ensureAuthSessionsTableReady();

  const params = [reason, actorType, actorId];
  let excludeClause = "";

  if (excludeSessionId) {
    excludeClause = "AND session_id <> ?";
    params.push(excludeSessionId);
  }

  await query(
    `
      UPDATE auth_sessions
      SET
        revoked_at = COALESCE(revoked_at, NOW()),
        revoke_reason = ?,
        updated_at = NOW()
      WHERE actor_type = ?
      AND actor_id = ?
      AND revoked_at IS NULL
      ${excludeClause}
    `,
    params
  );
}

module.exports = {
  ACTOR_ADMIN,
  ACTOR_USER,
  buildRefreshExpiryDate,
  createAuthSession,
  getActiveAuthSession,
  getRequestSessionMetadata,
  hashRefreshToken,
  refreshAuthSession,
  revokeActorSessions,
  revokeAuthSession,
};
