const { query } = require("../utils/db");
const {
  TOURNAMENT_MATCH_STATUS_COMPLETED,
  TOURNAMENT_MATCH_STATUS_WALKOVER,
  TOURNAMENT_REGISTRATION_STATUS_REGISTERED,
  TOURNAMENT_REGISTRATION_STATUS_WAITLISTED,
} = require("../utils/tournaments");
const {
  TOURNAMENT_TEAM_INVITE_STATUS_CANCELLED,
  TOURNAMENT_TEAM_INVITE_STATUS_PENDING,
  TOURNAMENT_TEAM_MEMBER_STATUS_ACCEPTED,
  TOURNAMENT_TEAM_MEMBER_STATUS_CAPTAIN,
  TOURNAMENT_TEAM_MEMBER_STATUS_PENDING,
  serializePersistentTournamentTeam,
  serializePersistentTournamentTeamInvite,
  serializePersistentTournamentTeamMember,
} = require("../utils/tournamentTeams");

async function getOwnedTournamentTeam(
  connection,
  teamId,
  ownerUserId,
  { forUpdate = false } = {}
) {
  const normalizedTeamId = Number(teamId || 0);
  const normalizedOwnerUserId = Number(ownerUserId || 0);

  if (!normalizedTeamId || !normalizedOwnerUserId) {
    return null;
  }

  const [rows] = await connection.query(
    `
      SELECT *
      FROM tournament_teams
      WHERE team_id = ?
      AND owner_user_id = ?
      LIMIT 1
      ${forUpdate ? "FOR UPDATE" : ""}
    `,
    [normalizedTeamId, normalizedOwnerUserId]
  );

  return rows[0] || null;
}

async function getUserIdentity(connection, userId) {
  const normalizedUserId = Number(userId || 0);

  if (!normalizedUserId) {
    return null;
  }

  const [rows] = await connection.query(
    `
      SELECT uid, name, email, mobile
      FROM users
      WHERE uid = ?
      LIMIT 1
    `,
    [normalizedUserId]
  );

  return rows[0] || null;
}

async function findUserByEmail(connection, email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const [rows] = await connection.query(
    `
      SELECT uid, name, email, mobile
      FROM users
      WHERE LOWER(email) = ?
      LIMIT 1
    `,
    [normalizedEmail]
  );

  return rows[0] || null;
}

async function cancelPendingTournamentTeamInvites(
  connection,
  teamMemberIds,
  status = TOURNAMENT_TEAM_INVITE_STATUS_CANCELLED
) {
  const inviteTargetIds = [...new Set(
    (Array.isArray(teamMemberIds) ? teamMemberIds : [])
      .map((value) => Number(value || 0))
      .filter((value) => value > 0)
  )];

  if (!inviteTargetIds.length) {
    return;
  }

  const placeholders = inviteTargetIds.map(() => "?").join(", ");
  await connection.query(
    `
      UPDATE tournament_team_invites
      SET
        status = ?,
        responded_at = COALESCE(responded_at, NOW()),
        updated_at = NOW()
      WHERE team_member_id IN (${placeholders})
      AND status = ?
    `,
    [status, ...inviteTargetIds, TOURNAMENT_TEAM_INVITE_STATUS_PENDING]
  );
}

async function replacePersistentTournamentTeamMembers(
  connection,
  teamId,
  ownerUserId,
  members
) {
  const [existingRows] = await connection.query(
    `
      SELECT *
      FROM tournament_team_members
      WHERE team_id = ?
      ORDER BY slot_number ASC, team_member_id ASC
    `,
    [teamId]
  );

  const existingBySlot = new Map(
    existingRows.map((row) => [Number(row.slot_number || 0), row])
  );
  const nextSlots = new Set(
    (Array.isArray(members) ? members : []).map((member) => Number(member.slot_number || 0))
  );

  const removedMembers = existingRows.filter(
    (row) => !nextSlots.has(Number(row.slot_number || 0))
  );

  if (removedMembers.length) {
    await cancelPendingTournamentTeamInvites(
      connection,
      removedMembers.map((row) => Number(row.team_member_id || 0))
    );

    const removedIds = removedMembers
      .map((row) => Number(row.team_member_id || 0))
      .filter((value) => value > 0);
    const placeholders = removedIds.map(() => "?").join(", ");
    await connection.query(
      `
        DELETE FROM tournament_team_members
        WHERE team_member_id IN (${placeholders})
      `,
      removedIds
    );
  }

  for (const member of Array.isArray(members) ? members : []) {
    const slotNumber = Number(member.slot_number || 0);
    const existing = existingBySlot.get(slotNumber) || null;
    const normalizedEmail = String(member.member_email || "").trim() || null;
    const normalizedMobile = String(member.member_mobile || "").trim() || null;
    const isCaptain = member.is_captain ? 1 : 0;

    if (existing) {
      let nextUserId = existing.user_id ? Number(existing.user_id) : null;
      let nextMembershipStatus = String(
        existing.membership_status || TOURNAMENT_TEAM_MEMBER_STATUS_PENDING
      )
        .trim()
        .toLowerCase();
      const existingEmail = String(existing.member_email || "").trim().toLowerCase();
      const nextEmailLower = String(normalizedEmail || "").trim().toLowerCase();
      const emailChanged = existingEmail !== nextEmailLower;

      if (isCaptain) {
        nextUserId = Number(ownerUserId || 0) || null;
        nextMembershipStatus = TOURNAMENT_TEAM_MEMBER_STATUS_CAPTAIN;
      } else if (emailChanged) {
        nextUserId = null;
        nextMembershipStatus = TOURNAMENT_TEAM_MEMBER_STATUS_PENDING;
        await cancelPendingTournamentTeamInvites(connection, [existing.team_member_id]);
      } else if (nextMembershipStatus === TOURNAMENT_TEAM_MEMBER_STATUS_CAPTAIN) {
        nextMembershipStatus = TOURNAMENT_TEAM_MEMBER_STATUS_PENDING;
      }

      await connection.query(
        `
          UPDATE tournament_team_members
          SET
            user_id = ?,
            slot_number = ?,
            member_name = ?,
            member_email = ?,
            member_mobile = ?,
            is_captain = ?,
            membership_status = ?,
            updated_at = NOW()
          WHERE team_member_id = ?
        `,
        [
          nextUserId,
          slotNumber,
          member.member_name,
          normalizedEmail,
          normalizedMobile,
          isCaptain,
          nextMembershipStatus,
          existing.team_member_id,
        ]
      );
      continue;
    }

    await connection.query(
      `
        INSERT INTO tournament_team_members (
          team_id,
          user_id,
          slot_number,
          member_name,
          member_email,
          member_mobile,
          is_captain,
          membership_status,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        teamId,
        isCaptain ? Number(ownerUserId || 0) || null : null,
        slotNumber,
        member.member_name,
        normalizedEmail,
        normalizedMobile,
        isCaptain,
        isCaptain
          ? TOURNAMENT_TEAM_MEMBER_STATUS_CAPTAIN
          : TOURNAMENT_TEAM_MEMBER_STATUS_PENDING,
      ]
    );
  }
}

async function attachPersistentTournamentTeamRelations(rows, connection = null) {
  if (!Array.isArray(rows) || !rows.length) {
    return [];
  }

  const teamIds = [...new Set(
    rows
      .map((row) => Number(row.team_id || 0))
      .filter((value) => value > 0)
  )];

  if (!teamIds.length) {
    return rows.map((row) => serializePersistentTournamentTeam({
      ...row,
      members: [],
      history: [],
      total_entries: 0,
      active_entries: 0,
      championship_count: 0,
      runner_up_count: 0,
      total_match_wins: 0,
      last_registered_at: null,
    }));
  }

  const executor = connection
    ? async (sql, params) => {
        const [resultRows] = await connection.query(sql, params);
        return resultRows;
      }
    : query;
  const placeholders = teamIds.map(() => "?").join(", ");

  const memberRows = await executor(
    `
      SELECT *
      FROM tournament_team_members
      WHERE team_id IN (${placeholders})
      ORDER BY team_id ASC, slot_number ASC, team_member_id ASC
    `,
    teamIds
  );

  const inviteRows = await executor(
    `
      SELECT
        inv.*,
        tm.user_id AS member_user_id,
        tm.slot_number,
        tm.member_name,
        tm.member_email,
        tm.member_mobile,
        tm.is_captain,
        tm.membership_status,
        inviter.uid AS inviter_user_id,
        inviter.name AS inviter_name,
        inviter.email AS inviter_email
      FROM tournament_team_invites inv
      JOIN tournament_team_members tm ON tm.team_member_id = inv.team_member_id
      JOIN users inviter ON inviter.uid = inv.invited_by_user_id
      WHERE inv.team_id IN (${placeholders})
      AND inv.status = ?
      ORDER BY inv.created_at DESC, inv.invite_id DESC
    `,
    [...teamIds, TOURNAMENT_TEAM_INVITE_STATUS_PENDING]
  );

  const summaryRows = await executor(
    `
      SELECT
        team_id,
        COUNT(*) AS total_entries,
        SUM(
          CASE
            WHEN status IN ('${TOURNAMENT_REGISTRATION_STATUS_REGISTERED}', '${TOURNAMENT_REGISTRATION_STATUS_WAITLISTED}')
            THEN 1
            ELSE 0
          END
        ) AS active_entries,
        MAX(created_at) AS last_registered_at
      FROM tournament_registrations
      WHERE team_id IN (${placeholders})
      GROUP BY team_id
    `,
    teamIds
  );

  const finalMatchRows = await executor(
    `
      SELECT
        tr.team_id,
        SUM(
          CASE
            WHEN finals.winner_registration_id = tr.registration_id THEN 1
            ELSE 0
          END
        ) AS championship_count,
        SUM(
          CASE
            WHEN finals.loser_registration_id = tr.registration_id THEN 1
            ELSE 0
          END
        ) AS runner_up_count
      FROM tournament_registrations tr
      LEFT JOIN (
        SELECT
          tbm.tournament_id,
          tbm.winner_registration_id,
          tbm.loser_registration_id
        FROM tournament_bracket_matches tbm
        JOIN (
          SELECT tournament_id, MAX(round_number) AS final_round
          FROM tournament_bracket_matches
          GROUP BY tournament_id
        ) AS rounds
          ON rounds.tournament_id = tbm.tournament_id
          AND rounds.final_round = tbm.round_number
        WHERE tbm.status IN ('${TOURNAMENT_MATCH_STATUS_COMPLETED}', '${TOURNAMENT_MATCH_STATUS_WALKOVER}')
      ) AS finals
        ON finals.tournament_id = tr.tournament_id
      WHERE tr.team_id IN (${placeholders})
      GROUP BY tr.team_id
    `,
    teamIds
  );

  const matchWinRows = await executor(
    `
      SELECT
        tr.team_id,
        COUNT(*) AS total_match_wins
      FROM tournament_bracket_matches tbm
      JOIN tournament_registrations tr
        ON tr.registration_id = tbm.winner_registration_id
      WHERE tr.team_id IN (${placeholders})
      AND tbm.status IN ('${TOURNAMENT_MATCH_STATUS_COMPLETED}', '${TOURNAMENT_MATCH_STATUS_WALKOVER}')
      AND tbm.winner_registration_id IS NOT NULL
      GROUP BY tr.team_id
    `,
    teamIds
  );

  const historyRows = await executor(
    `
      SELECT
        tr.team_id,
        tr.registration_id,
        tr.tournament_id,
        tr.team_name,
        tr.status AS registration_status,
        tr.attendance_status,
        tr.created_at AS registered_at,
        tr.waitlisted_at,
        tr.waitlist_promoted_at,
        t.slug AS tournament_slug,
        t.title AS tournament_title,
        t.game_title,
        t.status AS tournament_status,
        t.start_at,
        seeds.seed_number,
        CASE
          WHEN finals.winner_registration_id = tr.registration_id THEN 'champion'
          WHEN finals.loser_registration_id = tr.registration_id THEN 'runner_up'
          ELSE ''
        END AS placement
      FROM tournament_registrations tr
      JOIN tournaments t ON t.tournament_id = tr.tournament_id
      LEFT JOIN tournament_bracket_seeds seeds
        ON seeds.registration_id = tr.registration_id
      LEFT JOIN (
        SELECT
          tbm.tournament_id,
          tbm.winner_registration_id,
          tbm.loser_registration_id
        FROM tournament_bracket_matches tbm
        JOIN (
          SELECT tournament_id, MAX(round_number) AS final_round
          FROM tournament_bracket_matches
          GROUP BY tournament_id
        ) AS rounds
          ON rounds.tournament_id = tbm.tournament_id
          AND rounds.final_round = tbm.round_number
        WHERE tbm.status IN ('${TOURNAMENT_MATCH_STATUS_COMPLETED}', '${TOURNAMENT_MATCH_STATUS_WALKOVER}')
      ) AS finals
        ON finals.tournament_id = tr.tournament_id
      WHERE tr.team_id IN (${placeholders})
      ORDER BY tr.created_at DESC, tr.registration_id DESC
    `,
    teamIds
  );

  const membersByTeamId = new Map();
  const summaryByTeamId = new Map(
    summaryRows.map((row) => [Number(row.team_id || 0), row])
  );
  const finalsByTeamId = new Map(
    finalMatchRows.map((row) => [Number(row.team_id || 0), row])
  );
  const winsByTeamId = new Map(
    matchWinRows.map((row) => [Number(row.team_id || 0), row])
  );
  const historyByTeamId = new Map();
  const invitesByTeamId = new Map();

  memberRows.forEach((row) => {
    const teamId = Number(row.team_id || 0);
    if (!membersByTeamId.has(teamId)) {
      membersByTeamId.set(teamId, []);
    }

    membersByTeamId.get(teamId).push(serializePersistentTournamentTeamMember(row));
  });

  historyRows.forEach((row) => {
    const teamId = Number(row.team_id || 0);
    if (!historyByTeamId.has(teamId)) {
      historyByTeamId.set(teamId, []);
    }

    historyByTeamId.get(teamId).push(row);
  });

  inviteRows.forEach((row) => {
    const teamId = Number(row.team_id || 0);
    if (!invitesByTeamId.has(teamId)) {
      invitesByTeamId.set(teamId, []);
    }

    invitesByTeamId.get(teamId).push(
      serializePersistentTournamentTeamInvite({
        ...row,
        member: {
          team_member_id: row.team_member_id,
          team_id: row.team_id,
          user_id: row.member_user_id,
          slot_number: row.slot_number,
          member_name: row.member_name,
          member_email: row.member_email,
          member_mobile: row.member_mobile,
          is_captain: row.is_captain,
          membership_status: row.membership_status,
        },
        inviter: {
          user_id: row.inviter_user_id,
          name: row.inviter_name,
          email: row.inviter_email,
        },
      })
    );
  });

  return rows.map((row) => {
    const teamId = Number(row.team_id || 0);
    const summary = summaryByTeamId.get(teamId) || {};
    const finals = finalsByTeamId.get(teamId) || {};
    const wins = winsByTeamId.get(teamId) || {};
    const members = membersByTeamId.get(teamId) || [];
    const invites =
      Number(row.is_owner || 0) === 1 ? invitesByTeamId.get(teamId) || [] : [];

    return serializePersistentTournamentTeam({
      ...row,
      members,
      invites,
      history: historyByTeamId.get(teamId) || [],
      total_entries: summary.total_entries || 0,
      active_entries: summary.active_entries || 0,
      championship_count: finals.championship_count || 0,
      runner_up_count: finals.runner_up_count || 0,
      total_match_wins: wins.total_match_wins || 0,
      last_registered_at: summary.last_registered_at || null,
      accepted_member_count: members.filter(
        (member) =>
          member.membership_status === TOURNAMENT_TEAM_MEMBER_STATUS_CAPTAIN ||
          member.membership_status === TOURNAMENT_TEAM_MEMBER_STATUS_ACCEPTED
      ).length,
      pending_invite_count: members.filter(
        (member) => member.membership_status === TOURNAMENT_TEAM_MEMBER_STATUS_PENDING
      ).length,
    });
  });
}

async function listVisiblePersistentTournamentTeamsForUser(userId, connection = null) {
  const normalizedUserId = Number(userId || 0);
  if (!normalizedUserId) {
    return [];
  }

  const executor = connection
    ? async (sql, params) => {
        const [resultRows] = await connection.query(sql, params);
        return resultRows;
      }
    : query;

  const rows = await executor(
    `
      SELECT
        t.*,
        CASE
          WHEN t.owner_user_id = ? THEN 1
          ELSE 0
        END AS is_owner,
        CASE
          WHEN t.owner_user_id = ? THEN 'owner'
          ELSE 'member'
        END AS viewer_role
      FROM tournament_teams t
      WHERE t.owner_user_id = ?
      OR EXISTS (
        SELECT 1
        FROM tournament_team_members tm_view
        WHERE tm_view.team_id = t.team_id
        AND tm_view.user_id = ?
        AND tm_view.membership_status = ?
      )
      ORDER BY t.updated_at DESC, t.team_id DESC
    `,
    [
      normalizedUserId,
      normalizedUserId,
      normalizedUserId,
      normalizedUserId,
      TOURNAMENT_TEAM_MEMBER_STATUS_ACCEPTED,
    ]
  );

  return attachPersistentTournamentTeamRelations(rows, connection);
}

async function getTournamentTeamInvite(connection, inviteId, { forUpdate = false } = {}) {
  const normalizedInviteId = Number(inviteId || 0);

  if (!normalizedInviteId) {
    return null;
  }

  const [rows] = await connection.query(
    `
      SELECT
        inv.*,
        t.owner_user_id,
        t.team_name,
        t.team_tag,
        t.preferred_game,
        tm.user_id AS member_user_id,
        tm.slot_number,
        tm.member_name,
        tm.member_email,
        tm.member_mobile,
        tm.is_captain,
        tm.membership_status,
        inviter.uid AS inviter_user_id,
        inviter.name AS inviter_name,
        inviter.email AS inviter_email
      FROM tournament_team_invites inv
      JOIN tournament_teams t ON t.team_id = inv.team_id
      JOIN tournament_team_members tm ON tm.team_member_id = inv.team_member_id
      JOIN users inviter ON inviter.uid = inv.invited_by_user_id
      WHERE inv.invite_id = ?
      LIMIT 1
      ${forUpdate ? "FOR UPDATE" : ""}
    `,
    [normalizedInviteId]
  );

  return rows[0] || null;
}

async function getTournamentTeamMember(
  connection,
  teamId,
  teamMemberId,
  { forUpdate = false } = {}
) {
  const normalizedTeamId = Number(teamId || 0);
  const normalizedTeamMemberId = Number(teamMemberId || 0);

  if (!normalizedTeamId || !normalizedTeamMemberId) {
    return null;
  }

  const [rows] = await connection.query(
    `
      SELECT *
      FROM tournament_team_members
      WHERE team_id = ?
      AND team_member_id = ?
      LIMIT 1
      ${forUpdate ? "FOR UPDATE" : ""}
    `,
    [normalizedTeamId, normalizedTeamMemberId]
  );

  return rows[0] || null;
}

async function listIncomingTournamentTeamInvitesForUser(currentUser, connection = null) {
  const normalizedUserId = Number(currentUser?.uid || currentUser?.id || 0);
  const normalizedEmail = String(currentUser?.email || "")
    .trim()
    .toLowerCase();

  if (!normalizedUserId && !normalizedEmail) {
    return [];
  }

  const executor = connection
    ? async (sql, params) => {
        const [resultRows] = await connection.query(sql, params);
        return resultRows;
      }
    : query;

  const rows = await executor(
    `
      SELECT
        inv.*,
        t.team_name,
        t.team_tag,
        t.preferred_game,
        tm.user_id AS member_user_id,
        tm.slot_number,
        tm.member_name,
        tm.member_email,
        tm.member_mobile,
        tm.is_captain,
        tm.membership_status,
        inviter.uid AS inviter_user_id,
        inviter.name AS inviter_name,
        inviter.email AS inviter_email
      FROM tournament_team_invites inv
      JOIN tournament_teams t ON t.team_id = inv.team_id
      JOIN tournament_team_members tm ON tm.team_member_id = inv.team_member_id
      JOIN users inviter ON inviter.uid = inv.invited_by_user_id
      WHERE inv.status = ?
      AND (
        inv.invited_user_id = ?
        OR LOWER(inv.invited_email) = ?
      )
      ORDER BY inv.created_at DESC, inv.invite_id DESC
    `,
    [
      TOURNAMENT_TEAM_INVITE_STATUS_PENDING,
      normalizedUserId || 0,
      normalizedEmail,
    ]
  );

  return rows.map((row) =>
    serializePersistentTournamentTeamInvite({
      ...row,
      team: {
        team_id: row.team_id,
        team_name: row.team_name,
        team_tag: row.team_tag,
        preferred_game: row.preferred_game,
      },
      member: {
        team_member_id: row.team_member_id,
        team_id: row.team_id,
        user_id: row.member_user_id,
        slot_number: row.slot_number,
        member_name: row.member_name,
        member_email: row.member_email,
        member_mobile: row.member_mobile,
        is_captain: row.is_captain,
        membership_status: row.membership_status,
      },
      inviter: {
        user_id: row.inviter_user_id,
        name: row.inviter_name,
        email: row.inviter_email,
      },
    })
  );
}

module.exports = {
  attachPersistentTournamentTeamRelations,
  cancelPendingTournamentTeamInvites,
  findUserByEmail,
  getOwnedTournamentTeam,
  getTournamentTeamInvite,
  getTournamentTeamMember,
  getUserIdentity,
  listIncomingTournamentTeamInvitesForUser,
  listVisiblePersistentTournamentTeamsForUser,
  replacePersistentTournamentTeamMembers,
};
