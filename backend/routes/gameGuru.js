const express = require("express");

const auth = require("../middleware/auth");
const { aiQueryLimiter } = require("../middleware/requestThrottle");
const { generateGameGuruRecommendation } = require("../utils/gameGuru");

const router = express.Router();

router.post("/chat", auth, aiQueryLimiter, async (req, res) => {
  try {
    const response = await generateGameGuruRecommendation({
      userId: Number(req.user?.id || 0),
      searchQuery: req.body?.query,
    });

    res.json(response);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message || "GameGuru is unavailable right now.",
    });
  }
});

module.exports = router;
