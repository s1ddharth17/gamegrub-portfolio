const test = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");

const { createApp } = require("../app");
const { signToken } = require("../utils/security");
const { getOperationalMetricsSnapshot } = require("../utils/operationalMetrics");

function restoreProcessEnv(snapshot) {
  for (const key of Object.keys(process.env)) {
    if (!(key in snapshot)) {
      delete process.env[key];
    }
  }

  Object.assign(process.env, snapshot);
}

async function startTestServer(t, envOverrides = {}, appFactory = createApp) {
  const envSnapshot = { ...process.env };

  process.env.NODE_ENV = "test";
  process.env.APP_ENV = "test";
  process.env.ENABLE_IN_PROCESS_CRON = "false";

  for (const [key, value] of Object.entries(envOverrides)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = String(value);
    }
  }

  const { app } = appFactory();
  const server = await new Promise((resolve) => {
    const activeServer = app.listen(0, "127.0.0.1", () => resolve(activeServer));
  });

  t.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    restoreProcessEnv(envSnapshot);
  });

  return {
    app,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
}

test(
  "health endpoints expose status, headers, and same-origin CORS support",
  { concurrency: false },
  async (t) => {
    const { baseUrl } = await startTestServer(t, {
      CORS_ALLOWED_ORIGINS: "https://admin.gamegrub.app",
    });

    const response = await fetch(`${baseUrl}/health`, {
      headers: {
        Origin: "https://admin.gamegrub.app",
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://admin.gamegrub.app");
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(
      response.headers.get("content-security-policy"),
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    );
    assert.ok(response.headers.get("x-request-id"));
    assert.deepEqual(await response.json(), {
      status: "ok",
      storage: "local",
      in_process_cron: false,
    });

    const apiResponse = await fetch(`${baseUrl}/api/health`);
    assert.equal(apiResponse.status, 200);
    assert.deepEqual(await apiResponse.json(), {
      status: "ok",
      storage: "local",
      in_process_cron: false,
    });
  }
);

test(
  "Razorpay webhook receives the unmodified raw request body",
  { concurrency: false },
  async (t) => {
    const webhookSecret = "webhook-integration-secret";
    const { baseUrl } = await startTestServer(t, {
      RAZORPAY_WEBHOOK_SECRET: webhookSecret,
    });
    const rawBody = Buffer.from('{"event":"order.paid","payload":{}}');
    const signature = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    const response = await fetch(`${baseUrl}/api/payment/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": signature,
      },
      body: rawBody,
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { received: true, ignored: true });
  }
);

test(
  "blocked CORS origins are rejected without a server error",
  { concurrency: false },
  async (t) => {
    const { baseUrl } = await startTestServer(t, {
      CORS_ALLOWED_ORIGINS: "https://admin.gamegrub.app",
    });

    const response = await fetch(`${baseUrl}/health`, {
      headers: {
        Origin: "https://evil.example.com",
      },
    });

    assert.equal(response.status, 403);
    assert.match(
      response.headers.get("x-request-id") || "",
      /.+/
    );
    assert.deepEqual(await response.json(), {
      message: "Origin is not allowed by CORS.",
    });
  }
);

test(
  "unsafe request ids are replaced before being reflected",
  { concurrency: false },
  async (t) => {
    const { baseUrl } = await startTestServer(t);
    const unsafeRequestId = "x".repeat(200);

    const response = await fetch(`${baseUrl}/health`, {
      headers: {
        "x-request-id": unsafeRequestId,
      },
    });

    assert.equal(response.status, 200);
    assert.notEqual(response.headers.get("x-request-id"), unsafeRequestId);
    assert.match(response.headers.get("x-request-id") || "", /.+/);
  }
);

test(
  "HTTP metrics track 5xx responses with the emitted request ID",
  { concurrency: false },
  async (t) => {
    const { app, baseUrl } = await startTestServer(t, {
      OPS_API_ERROR_THRESHOLD: "10000",
    });
    app.get("/__test/operational-error", (req, res) => {
      res.status(503).json({ message: "test outage" });
    });
    const before = getOperationalMetricsSnapshot().http.server_errors;

    const response = await fetch(`${baseUrl}/__test/operational-error`);
    const requestId = response.headers.get("x-request-id");
    const after = getOperationalMetricsSnapshot();

    assert.equal(response.status, 503);
    assert.ok(requestId);
    assert.equal(after.http.server_errors, before + 1);
    assert.ok(after.http.recent_errors.some((event) => event.request_id === requestId));
  }
);

test(
  "protected user routes reject unauthenticated requests before route handlers run",
  { concurrency: false },
  async (t) => {
    const { baseUrl } = await startTestServer(t);
    const response = await fetch(`${baseUrl}/api/user/profile`);

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      message: "No token",
    });
  }
);

test(
  "protected user routes report an expired authentication session clearly",
  { concurrency: false },
  async (t) => {
    const authSessions = require("../utils/authSessions");
    const activeSession = t.mock.method(authSessions, "getActiveAuthSession", async () => null);
    delete require.cache[require.resolve("../middleware/auth")];
    delete require.cache[require.resolve("../routes/user")];
    delete require.cache[require.resolve("../app")];
    const { createApp: createAppWithRevokedSession } = require("../app");
    const { baseUrl } = await startTestServer(t, {}, createAppWithRevokedSession);
    const token = signToken({ id: 11, role: "user", sid: "revoked-session-id" });

    const response = await fetch(`${baseUrl}/api/user/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      message: "Session expired",
    });
    assert.equal(activeSession.mock.callCount(), 1);
  }
);
