const { randomUUID } = require("node:crypto");

const LEVEL_PRIORITIES = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};
const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|credential|otp|pass(word)?|refresh[_-]?token|secret|session[_-]?token|token|api[_-]?key)/i;

function parseLevel(value) {
  const normalized = String(value || "info").trim().toLowerCase();
  return LEVEL_PRIORITIES[normalized] ? normalized : "info";
}

function isProductionEnvironment() {
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  const appEnv = String(process.env.APP_ENV || "").trim().toLowerCase();
  return nodeEnv === "production" || appEnv === "production";
}

function normalizeRequestId(value) {
  const candidate = String(value || "").trim();

  if (/^[A-Za-z0-9._:-]{1,128}$/.test(candidate)) {
    return candidate;
  }

  return randomUUID();
}

function safeSerialize(value, depth = 0, key = "") {
  if (key && SENSITIVE_KEY_PATTERN.test(key)) {
    return "[redacted]";
  }

  if (depth > 4) {
    return "[truncated]";
  }

  if (value instanceof Error) {
    const serialized = {
      name: value.name,
      message: value.message,
      code: value.code,
      statusCode: value.statusCode,
      status: value.status,
    };

    if (!isProductionEnvironment()) {
      serialized.stack = value.stack;
    }

    return serialized;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => safeSerialize(entry, depth + 1));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entry]) => [
        entryKey,
        safeSerialize(entry, depth + 1, entryKey),
      ])
    );
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "function") {
    return `[function ${value.name || "anonymous"}]`;
  }

  return value;
}

function createLogger(boundMeta = {}) {
  const activeLevel = parseLevel(process.env.LOG_LEVEL);
  const activePriority = LEVEL_PRIORITIES[activeLevel];
  const service = String(process.env.LOG_SERVICE_NAME || "gamegrub-backend").trim();
  const environment = String(
    process.env.APP_ENV || process.env.NODE_ENV || "development"
  ).trim();

  function emit(level, message, meta = {}) {
    if (LEVEL_PRIORITIES[level] < activePriority) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service,
      environment,
      message,
      ...safeSerialize({ ...boundMeta, ...meta }),
    };

    const line = JSON.stringify(entry);

    if (level === "warn" || level === "error") {
      console.error(line);
      return;
    }

    console.log(line);
  }

  return {
    child(extraMeta = {}) {
      return createLogger({ ...boundMeta, ...extraMeta });
    },
    debug(message, meta) {
      emit("debug", message, meta);
    },
    info(message, meta) {
      emit("info", message, meta);
    },
    warn(message, meta) {
      emit("warn", message, meta);
    },
    error(message, meta) {
      emit("error", message, meta);
    },
  };
}

const logger = createLogger();

function createRequestLogger() {
  return function requestLogger(req, res, next) {
    const requestId = normalizeRequestId(
      typeof req.get === "function" ? req.get("x-request-id") : ""
    );
    const startedAt = process.hrtime.bigint();
    let completed = false;

    req.requestId = requestId;
    req.logger = logger.child({
      component: "http",
      request_id: requestId,
      method: req.method,
      path: req.originalUrl,
    });

    res.setHeader("x-request-id", requestId);
    req.logger.info("request_started");

    function finalize(message) {
      if (completed) {
        return;
      }

      completed = true;
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      req.logger.info(message, {
        status_code: res.statusCode,
        duration_ms: Number(durationMs.toFixed(2)),
      });
    }

    res.on("finish", () => finalize("request_completed"));
    res.on("close", () => {
      if (!res.writableEnded) {
        finalize("request_aborted");
      }
    });

    next();
  };
}

module.exports = {
  createLogger,
  createRequestLogger,
  logger,
};
