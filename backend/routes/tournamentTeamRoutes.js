const auth = require("../middleware/auth");
const { withTransaction } = require("../utils/db");
const {
  parsePersistentTournamentTeamInput,
  TOURNAMENT_TEAM_INVITE_STATUS_ACCEPTED,
  TOURNAMENT_TEAM_INVITE_STATUS_DECLINED,
  TOURNAMENT_TEAM_INVITE_STATUS_PENDING,
  TOURNAMENT_TEAM_MEMBER_STATUS_ACCEPTED,
  TOURNAMENT_TEAM_MEMBER_STATUS_DECLINED,
  TOURNAMENT_TEAM_MEMBER_STATUS_PENDING,
  normalizeTournamentTeamInviteStatus,
  serializePersistentTournamentTeamInvite,
} = require("../utils/tournamentTeams");
const { getAuthenticatedUserId } = require("./tournamentRouteSupport");
const {
  cancelPendingTournamentTeamInvites,
  findUserByEmail,
  getOwnedTournamentTeam,
  getTournamentTeamInvite,
  getTournamentTeamMember,
  getUserIdentity,
  listIncomingTournamentTeamInvitesForUser,
  listVisiblePersistentTournamentTeamsForUser,
  replacePersistentTournamentTeamMembers,
} = require("./tournamentTeamSupport");

async function requireCurrentUser(connection, userId) {
  const user = await getUserIdentity(connection, userId);

  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  return user;
}

function serializeInviteWithRelations(invite) {
  if (!invite) {
    return null;
  }

  return serializePersistentTournamentTeamInvite({
    ...invite,
    team: {
      team_id: invite.team_id,
      team_name: invite.team_name,
      team_tag: invite.team_tag,
      preferred_game: invite.preferred_game,
    },
    member: {
      team_member_id: invite.team_member_id,
      team_id: invite.team_id,
      user_id: invite.member_user_id,
      slot_number: invite.slot_number,
      member_name: invite.member_name,
      member_email: invite.member_email,
      member_mobile: invite.member_mobile,
      is_captain: invite.is_captain,
      membership_status: invite.membership_status,
    },
    inviter: {
      user_id: invite.inviter_user_id,
      name: invite.inviter_name,
      email: invite.inviter_email,
    },
  });
}

function registerTournamentTeamRoutes(router) {
  router.get("/teams", auth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({ error: "User token required." });
    }

    try {
      const teams = await listVisiblePersistentTournamentTeamsForUser(userId);
      return res.json(teams);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  router.get("/team-invites", auth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({ error: "User token required." });
    }

    try {
      const invites = await withTransaction(async (connection) => {
        const currentUser = await requireCurrentUser(connection, userId);
        return listIncomingTournamentTeamInvitesForUser(currentUser, connection);
      });

      return res.json(invites);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.post("/teams", auth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({ error: "User token required." });
    }

    try {
      const team = await withTransaction(async (connection) => {
        const user = await requireCurrentUser(connection, userId);
        const parsed = parsePersistentTournamentTeamInput(req.body, {
          captain: user,
        });

        if (parsed.errors.length) {
          const error = new Error(parsed.errors.join(" "));
          error.statusCode = 400;
          throw error;
        }

        let insertedTeamId = 0;

        try {
          const [result] = await connection.query(
            `
              INSERT INTO tournament_teams (
                owner_user_id,
                team_name,
                team_tag,
                preferred_game,
                team_bio,
                created_at,
                updated_at
              )
              VALUES (?, ?, ?, ?, ?, NOW(), NOW())
            `,
            [
              userId,
              parsed.data.team_name,
              parsed.data.team_tag || null,
              parsed.data.preferred_game || null,
              parsed.data.team_bio || null,
            ]
          );

          insertedTeamId = Number(result.insertId || 0);
        } catch (error) {
          if (error.code === "ER_DUP_ENTRY") {
            error.statusCode = 409;
            error.message = "You already have a saved team with that name.";
          }
          throw error;
        }

        await replacePersistentTournamentTeamMembers(
          connection,
          insertedTeamId,
          userId,
          parsed.data.members
        );

        const teams = await listVisiblePersistentTournamentTeamsForUser(
          userId,
          connection
        );
        return teams.find((entry) => Number(entry.team_id || 0) === insertedTeamId) || null;
      });

      return res.json({
        message: "Team saved.",
        team,
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.put("/teams/:id", auth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const teamId = Number(req.params.id || 0);

    if (!userId) {
      return res.status(401).json({ error: "User token required." });
    }

    if (!teamId) {
      return res.status(400).json({ error: "Team id is required." });
    }

    try {
      const team = await withTransaction(async (connection) => {
        const user = await requireCurrentUser(connection, userId);
        const existingTeam = await getOwnedTournamentTeam(connection, teamId, userId, {
          forUpdate: true,
        });

        if (!existingTeam) {
          const error = new Error("Saved team not found.");
          error.statusCode = 404;
          throw error;
        }

        const parsed = parsePersistentTournamentTeamInput(req.body, {
          captain: user,
        });

        if (parsed.errors.length) {
          const error = new Error(parsed.errors.join(" "));
          error.statusCode = 400;
          throw error;
        }

        try {
          await connection.query(
            `
              UPDATE tournament_teams
              SET
                team_name = ?,
                team_tag = ?,
                preferred_game = ?,
                team_bio = ?,
                updated_at = NOW()
              WHERE team_id = ?
            `,
            [
              parsed.data.team_name,
              parsed.data.team_tag || null,
              parsed.data.preferred_game || null,
              parsed.data.team_bio || null,
              teamId,
            ]
          );
        } catch (error) {
          if (error.code === "ER_DUP_ENTRY") {
            error.statusCode = 409;
            error.message = "You already have a saved team with that name.";
          }
          throw error;
        }

        await replacePersistentTournamentTeamMembers(
          connection,
          teamId,
          userId,
          parsed.data.members
        );

        const teams = await listVisiblePersistentTournamentTeamsForUser(
          userId,
          connection
        );
        return teams.find((entry) => Number(entry.team_id || 0) === teamId) || null;
      });

      return res.json({
        message: "Team updated.",
        team,
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.post("/teams/:id/invites", auth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const teamId = Number(req.params.id || 0);
    const teamMemberId = Number(req.body?.team_member_id || 0);
    const inviteMessage = String(req.body?.message || "").trim().slice(0, 280);

    if (!userId) {
      return res.status(401).json({ error: "User token required." });
    }

    if (!teamId) {
      return res.status(400).json({ error: "Team id is required." });
    }

    if (!teamMemberId) {
      return res.status(400).json({ error: "Team member id is required." });
    }

    try {
      const result = await withTransaction(async (connection) => {
        const owner = await requireCurrentUser(connection, userId);
        const team = await getOwnedTournamentTeam(connection, teamId, userId, {
          forUpdate: true,
        });

        if (!team) {
          const error = new Error("Saved team not found.");
          error.statusCode = 404;
          throw error;
        }

        const teamMember = await getTournamentTeamMember(connection, teamId, teamMemberId, {
          forUpdate: true,
        });

        if (!teamMember) {
          const error = new Error("Team member not found.");
          error.statusCode = 404;
          throw error;
        }

        if (Number(teamMember.is_captain || 0) === 1) {
          const error = new Error("Captain slots do not need invites.");
          error.statusCode = 400;
          throw error;
        }

        const memberEmail = String(teamMember.member_email || "").trim().toLowerCase();
        if (!memberEmail) {
          const error = new Error("Add a teammate email before sending an invite.");
          error.statusCode = 400;
          throw error;
        }

        const memberStatus = String(
          teamMember.membership_status || TOURNAMENT_TEAM_MEMBER_STATUS_PENDING
        )
          .trim()
          .toLowerCase();

        if (memberStatus === TOURNAMENT_TEAM_MEMBER_STATUS_ACCEPTED) {
          const error = new Error("That teammate is already linked to this squad.");
          error.statusCode = 409;
          throw error;
        }

        const [pendingInviteRows] = await connection.query(
          `
            SELECT invite_id
            FROM tournament_team_invites
            WHERE team_member_id = ?
            AND status = ?
            LIMIT 1
            FOR UPDATE
          `,
          [teamMemberId, TOURNAMENT_TEAM_INVITE_STATUS_PENDING]
        );

        if (pendingInviteRows.length) {
          const error = new Error("An invite is already pending for that teammate.");
          error.statusCode = 409;
          throw error;
        }

        const matchedUser = await findUserByEmail(connection, memberEmail);

        await connection.query(
          `
            UPDATE tournament_team_members
            SET
              user_id = NULL,
              membership_status = ?,
              updated_at = NOW()
            WHERE team_member_id = ?
          `,
          [TOURNAMENT_TEAM_MEMBER_STATUS_PENDING, teamMemberId]
        );

        const [inviteResult] = await connection.query(
          `
            INSERT INTO tournament_team_invites (
              team_id,
              team_member_id,
              invited_email,
              invited_user_id,
              invited_by_user_id,
              status,
              message,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
          `,
          [
            teamId,
            teamMemberId,
            memberEmail,
            matchedUser ? Number(matchedUser.uid || 0) || null : null,
            Number(owner.uid || owner.id || userId),
            TOURNAMENT_TEAM_INVITE_STATUS_PENDING,
            inviteMessage || null,
          ]
        );

        const teams = await listVisiblePersistentTournamentTeamsForUser(userId, connection);
        const nextTeam = teams.find((entry) => Number(entry.team_id || 0) === teamId) || null;
        const invite =
          nextTeam?.invites?.find(
            (entry) => Number(entry.invite_id || 0) === Number(inviteResult.insertId || 0)
          ) || null;

        return {
          team: nextTeam,
          invite,
        };
      });

      return res.json({
        message: "Invite sent.",
        invite: result.invite,
        team: result.team,
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.post("/team-invites/:id/respond", auth, async (req, res) => {
    const userId = getAuthenticatedUserId(req);
    const inviteId = Number(req.params.id || 0);
    const actionInput = String(req.body?.action || "").trim().toLowerCase();
    const action =
      actionInput === "accept"
        ? TOURNAMENT_TEAM_INVITE_STATUS_ACCEPTED
        : actionInput === "decline"
            ? TOURNAMENT_TEAM_INVITE_STATUS_DECLINED
            : normalizeTournamentTeamInviteStatus(actionInput, "");

    if (!userId) {
      return res.status(401).json({ error: "User token required." });
    }

    if (!inviteId) {
      return res.status(400).json({ error: "Invite id is required." });
    }

    if (
      action !== TOURNAMENT_TEAM_INVITE_STATUS_ACCEPTED &&
      action !== TOURNAMENT_TEAM_INVITE_STATUS_DECLINED
    ) {
      return res.status(400).json({ error: "Action must be accept or decline." });
    }

    try {
      const result = await withTransaction(async (connection) => {
        const currentUser = await requireCurrentUser(connection, userId);
        const existingInvite = await getTournamentTeamInvite(connection, inviteId, {
          forUpdate: true,
        });

        if (!existingInvite) {
          const error = new Error("Invite not found.");
          error.statusCode = 404;
          throw error;
        }

        const currentEmail = String(currentUser.email || "").trim().toLowerCase();
        const inviteEmail = String(existingInvite.invited_email || "")
          .trim()
          .toLowerCase();
        const inviteUserId = Number(existingInvite.invited_user_id || 0);
        const isInviteTarget =
          inviteUserId === userId || (currentEmail && currentEmail === inviteEmail);

        if (!isInviteTarget) {
          const error = new Error("That invite is not assigned to your account.");
          error.statusCode = 403;
          throw error;
        }

        if (
          String(existingInvite.status || "").trim().toLowerCase() !==
          TOURNAMENT_TEAM_INVITE_STATUS_PENDING
        ) {
          const error = new Error("That invite has already been handled.");
          error.statusCode = 409;
          throw error;
        }

        const teamMember = await getTournamentTeamMember(
          connection,
          existingInvite.team_id,
          existingInvite.team_member_id,
          { forUpdate: true }
        );

        if (!teamMember) {
          const error = new Error("Team member not found.");
          error.statusCode = 404;
          throw error;
        }

        if (Number(teamMember.is_captain || 0) === 1) {
          const error = new Error("Captain slots cannot use invite responses.");
          error.statusCode = 400;
          throw error;
        }

        await connection.query(
          `
            UPDATE tournament_team_invites
            SET
              invited_user_id = ?,
              status = ?,
              responded_at = NOW(),
              updated_at = NOW()
            WHERE invite_id = ?
          `,
          [userId, action, inviteId]
        );

        if (action === TOURNAMENT_TEAM_INVITE_STATUS_ACCEPTED) {
          await connection.query(
            `
              UPDATE tournament_team_members
              SET
                user_id = ?,
                membership_status = ?,
                updated_at = NOW()
              WHERE team_member_id = ?
            `,
            [userId, TOURNAMENT_TEAM_MEMBER_STATUS_ACCEPTED, existingInvite.team_member_id]
          );

          await cancelPendingTournamentTeamInvites(connection, [existingInvite.team_member_id]);
        } else {
          await connection.query(
            `
              UPDATE tournament_team_members
              SET
                user_id = NULL,
                membership_status = ?,
                updated_at = NOW()
              WHERE team_member_id = ?
            `,
            [TOURNAMENT_TEAM_MEMBER_STATUS_DECLINED, existingInvite.team_member_id]
          );
        }

        const refreshedInvite = await getTournamentTeamInvite(connection, inviteId);
        const visibleTeams = await listVisiblePersistentTournamentTeamsForUser(userId, connection);
        const visibleTeam =
          visibleTeams.find(
            (entry) => Number(entry.team_id || 0) === Number(existingInvite.team_id || 0)
          ) || null;

        return {
          invite: serializeInviteWithRelations(refreshedInvite),
          team: visibleTeam,
        };
      });

      return res.json({
        message:
          action === TOURNAMENT_TEAM_INVITE_STATUS_ACCEPTED
            ? "Team invite accepted."
            : "Team invite declined.",
        invite: result.invite,
        team: result.team,
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  });
}

module.exports = {
  registerTournamentTeamRoutes,
};
