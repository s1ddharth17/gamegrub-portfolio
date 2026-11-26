const express = require("express");

const auth = require("../middleware/auth");
const { withTransaction } = require("../utils/db");
const {
  buildLoyaltySummary,
  createReferralClaim,
} = require("../utils/loyaltyProgram");

const router = express.Router();

router.get("/", auth, async (req, res) => {
  const userId = Number(req.user?.id || 0);
  if (!userId) return res.status(401).json({ message: "User token required." });

  try {
    const summary = await withTransaction((connection) =>
      buildLoyaltySummary(connection, userId)
    );
    return res.json(summary);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "Unable to load loyalty rewards.",
    });
  }
});

router.post("/referral", auth, async (req, res) => {
  const userId = Number(req.user?.id || 0);
  if (!userId) return res.status(401).json({ message: "User token required." });

  try {
    const claim = await withTransaction((connection) =>
      createReferralClaim(connection, {
        userId,
        referralCode: req.body?.referral_code,
      })
    );
    return res.status(201).json({
      message:
        "Referral connected. You and your friend earn 150 points after your first paid café visit.",
      referral_code: claim.referralCode,
      reward_points_per_person: claim.rewardPoints,
      status: "pending",
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "A referral code has already been applied to this account.",
      });
    }
    return res.status(error.statusCode || 500).json({
      message: error.message || "Unable to apply that referral code.",
    });
  }
});

module.exports = router;
