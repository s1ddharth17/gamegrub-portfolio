const express = require("express");

const adminAuth = require("../middleware/adminAuth");
const auth = require("../middleware/auth");
const businessService = require("../utils/businesses");

function parseLimit(value, fallback = 24) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function registerBusinessRoutes(router) {
  router.get("/discovery", async (req, res) => {
    try {
      const businesses = await businessService.listPublicCafeDiscovery({
        date: req.query?.date,
        startHour: req.query?.start_hour,
        durationHours: req.query?.duration_hours,
      });
      return res.json(businesses);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.get("/all", async (req, res) => {
    try {
      const businesses = await businessService.listPublicBusinesses({
        limit: parseLimit(req.query?.limit, 24),
      });
      res.json(businesses);
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.get("/details/:slugOrId", async (req, res) => {
    try {
      const business = await businessService.getPublicBusinessDetails(req.params.slugOrId);

      if (!business) {
        return res.status(404).json({ error: "Business not found." });
      }

      return res.json(business);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.get("/reviews/:slugOrId", async (req, res) => {
    try {
      const reviewFeed = await businessService.listPublicBusinessReviews(
        req.params.slugOrId,
        { limit: parseLimit(req.query?.limit, 6) }
      );

      if (!reviewFeed) {
        return res.status(404).json({ error: "Business not found." });
      }

      return res.json(reviewFeed);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.get("/review-state/:businessId", auth, async (req, res) => {
    try {
      const reviewState = await businessService.getUserBusinessReviewState({
        businessId: req.params.businessId,
        userId: Number(req.user?.id || 0),
      });

      if (!reviewState) {
        return res.status(404).json({ error: "Business not found." });
      }

      return res.json(reviewState);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.post("/review", auth, async (req, res) => {
    try {
      const payload = await businessService.upsertUserBusinessReview({
        businessId: req.body?.business_id,
        userId: Number(req.user?.id || 0),
        rating: req.body?.rating,
        reviewTitle: req.body?.title,
        reviewText: req.body?.review_text,
      });

      return res.json(payload);
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  });

  router.get("/admin/access", adminAuth.requireActiveAdmin, async (req, res) => {
    try {
      const businesses = await businessService.listAccessibleBusinessesForAdmin(req.admin);
      res.json(businesses);
    } catch (error) {
      res.status(error.statusCode || 500).json({ error: error.message });
    }
  });
}

const router = express.Router();
registerBusinessRoutes(router);

module.exports = router;
module.exports.registerBusinessRoutes = registerBusinessRoutes;
