const express = require("express");

const {
  registerTournamentAdminLifecycleRoutes,
} = require("./tournamentAdminLifecycleRoutes");
const {
  registerTournamentAdminOperationsRoutes,
} = require("./tournamentAdminOperationsRoutes");
const {
  registerTournamentAdminRegistrationRoutes,
} = require("./tournamentAdminRegistrationRoutes");
const {
  registerTournamentCommunityAdminRoutes,
} = require("./tournamentCommunityAdminRoutes");
const {
  registerTournamentNotificationRoutes,
} = require("./tournamentNotificationRoutes");
const {
  registerTournamentParticipantRoutes,
} = require("./tournamentParticipantRoutes");
const { registerTournamentPublicRoutes } = require("./tournamentPublicRoutes");
const { registerTournamentSocialRoutes } = require("./tournamentSocialRoutes");
const { registerTournamentCommunityInteractionRoutes } = require("./tournamentCommunityInteractionRoutes");
const { registerTournamentTeamRoutes } = require("./tournamentTeamRoutes");

const router = express.Router();

registerTournamentPublicRoutes(router);
registerTournamentSocialRoutes(router);
registerTournamentCommunityInteractionRoutes(router);
registerTournamentTeamRoutes(router);
registerTournamentParticipantRoutes(router);
registerTournamentNotificationRoutes(router);
registerTournamentCommunityAdminRoutes(router);
registerTournamentAdminOperationsRoutes(router);
registerTournamentAdminRegistrationRoutes(router);
registerTournamentAdminLifecycleRoutes(router);

module.exports = router;
