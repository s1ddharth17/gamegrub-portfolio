require("dotenv").config({ quiet: true });

const express = require("express");
const cors = require("cors");
const {
  assertStartupConfig,
  parseAllowedOrigins,
} = require("./config/runtime");
const {
  createUploadsMiddleware,
  ensureUploadStorageReady,
  getUploadStorageMode,
} = require("./utils/uploadStorage");
const { createRequestLogger, logger } = require("./utils/logger");
const { recordHttpResponse } = require("./utils/operationalMetrics");
const { getCronHealthSnapshot } = require("./cron/monitor");
const securityHeaders = require("./middleware/securityHeaders");

const adminRoutes = require("./routes/admin");
const adminOperationsRoutes = require("./routes/adminOperations");
const adminSettlementRoutes = require("./routes/adminSettlements");
const businessAdminRoutes = require("./routes/businessAdmin");
const supportRoutes = require("./routes/support");
const loyaltyRoutes = require("./routes/loyalty");
const gameGuruRoutes = require("./routes/gameGuru");
const userRoutes = require("./routes/user");
const businessRoutes = require("./routes/business");
const pcRoutes = require("./routes/pc");
const menuRoutes = require("./routes/menu");
const bookingRoutes = require("./routes/booking");
const stationWaitlistRoutes = require("./routes/stationWaitlist");
const paymentRoutes = require("./routes/payment");
const orderRoutes = require("./routes/order");
const billRoutes = require("./routes/bills");
const tournamentRoutes = require("./routes/tournament");
const notificationRoutes = require("./routes/notifications");

const { isInProcessCronEnabled, startInProcessCron } = require("./cron/worker");

function createCorsOriginError() {
  const error = new Error("Origin is not allowed by CORS.");
  error.code = "CORS_ORIGIN_DENIED";
  error.status = 403;
  return error;
}

function resolveHttpErrorStatus(error) {
  if (error?.code === "LIMIT_FILE_SIZE") {
    return 413;
  }

  if (
    error?.name === "MulterError" ||
    String(error?.code || "").startsWith("LIMIT_")
  ) {
    return error.status || error.statusCode || 400;
  }

  if (error?.type === "entity.too.large") {
    return 413;
  }

  return error.status || error.statusCode || 500;
}

function createApp() {
  const app = express();
  const startupReport = assertStartupConfig({ logger });
  const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
  const corsOptions = {
    credentials: true,
    origin(origin, callback) {
      if (
        !origin ||
        allowedOrigins.length === 0 ||
        allowedOrigins.includes(origin)
      ) {
        return callback(null, true);
      }

      return callback(createCorsOriginError());
    },
  };

  ensureUploadStorageReady();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(createRequestLogger());
  app.use((req, res, next) => {
    const startedAt = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const route = req.route?.path || req.path || req.originalUrl || "unknown";
      recordHttpResponse({
        requestId: req.requestId,
        method: req.method,
        route: `${req.baseUrl || ""}${route}`,
        statusCode: res.statusCode,
        durationMs,
      });
    });
    next();
  });
  app.use(securityHeaders);
  app.use(cors(corsOptions));
  app.use("/api/payment/webhook", express.raw({ type: "application/json", limit: "1mb" }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use("/uploads", createUploadsMiddleware());

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      storage: getUploadStorageMode(),
      in_process_cron: isInProcessCronEnabled(),
    });
  });

  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      storage: getUploadStorageMode(),
      in_process_cron: isInProcessCronEnabled(),
    });
  });

  async function handleCronHealth(req, res, next) {
    try {
      const snapshot = await getCronHealthSnapshot();
      res.status(snapshot.status === "ok" ? 200 : 503).json(snapshot);
    } catch (error) {
      next(error);
    }
  }

  app.get("/health/cron", handleCronHealth);
  app.get("/api/health/cron", handleCronHealth);

  app.use("/api/admin/operations", adminOperationsRoutes);
  app.use("/api/admin/businesses", businessAdminRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/admin/settlements", adminSettlementRoutes);
  app.use("/api/game-guru", gameGuruRoutes);
  app.use("/api/user", userRoutes);
  app.use("/api/business", businessRoutes);
  app.use("/api/pc", pcRoutes);
  app.use("/api/menu", menuRoutes);
  app.use("/api/booking/waitlist", stationWaitlistRoutes);
  app.use("/api/booking", bookingRoutes);
  app.use("/api/payment", paymentRoutes);
  app.use("/api/order", orderRoutes);
  app.use("/api/bills", billRoutes);
  app.use("/api/tournament", tournamentRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/support", supportRoutes);
  app.use("/api/loyalty", loyaltyRoutes);

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    const statusCode = resolveHttpErrorStatus(error);
    const activeLogger = req?.logger || logger;

    activeLogger.error("request_failed", {
      status_code: statusCode,
      error,
    });

    res.status(statusCode).json({
      message: error.message || "Unexpected server error",
    });
  });

  return {
    app,
    startupReport,
  };
}

function startServer({
  port = Number(process.env.PORT || 3001),
  host = String(process.env.HOST || "0.0.0.0").trim() || "0.0.0.0",
  startCron = true,
} = {}) {
  const { app, startupReport } = createApp();
  const server = app.listen(port, host, () => {
    logger.info("server_started", {
      host,
      port,
      upload_storage: getUploadStorageMode(),
      in_process_cron: isInProcessCronEnabled(),
      allowed_origins: startupReport.allowedOrigins,
    });
  });

  if (startCron) {
    startInProcessCron();
  }

  return server;
}

module.exports = {
  createApp,
  startServer,
};
