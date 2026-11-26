const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAlertPayload,
  normalizeBaseUrl,
  parseEndpointList,
  runHealthChecks,
  summarizeFailures,
  toAbsoluteUrl,
} = require("../scripts/healthcheck");

test("parseEndpointList falls back to the default health endpoints", () => {
  assert.deepEqual(parseEndpointList(""), [
    "/health",
    "/api/health",
    "/health/cron",
    "/api/health/cron",
  ]);
});

test("normalizeBaseUrl trims a trailing slash and rejects empty input", () => {
  assert.equal(normalizeBaseUrl("https://api.example.com/"), "https://api.example.com");
  assert.throws(() => normalizeBaseUrl("  "), /HEALTHCHECK_BASE_URL is required/);
});

test("toAbsoluteUrl joins base URLs and endpoint paths safely", () => {
  assert.equal(toAbsoluteUrl("https://api.example.com", "/health"), "https://api.example.com/health");
  assert.equal(
    toAbsoluteUrl("https://api.example.com", "api/health"),
    "https://api.example.com/api/health"
  );
});

test("runHealthChecks reports failures for unhealthy and unreachable endpoints", async () => {
  const responses = new Map([
    [
      "https://api.example.com/health",
      {
        status: 200,
        body: JSON.stringify({ status: "ok", in_process_cron: false }),
      },
    ],
    [
      "https://api.example.com/health/cron",
      {
        status: 503,
        body: JSON.stringify({
          status: "degraded",
          engines: {
            session_engine: { health: "stale" },
          },
        }),
      },
    ],
  ]);

  const summary = await runHealthChecks({
    baseUrl: "https://api.example.com/",
    endpointPaths: ["/health", "/health/cron", "/missing"],
    fetchImpl: async (url) => {
      if (url === "https://api.example.com/missing") {
        throw new Error("connect ECONNREFUSED");
      }

      const entry = responses.get(url);
      return {
        status: entry.status,
        async text() {
          return entry.body;
        },
      };
    },
  });

  assert.equal(summary.ok, false);
  assert.equal(summary.results.length, 3);
  assert.equal(summary.results[0].ok, true);
  assert.equal(summary.results[1].ok, false);
  assert.deepEqual(summary.results[1].engine_states, {
    session_engine: "stale",
  });
  assert.equal(summary.results[2].error, "connect ECONNREFUSED");
  assert.deepEqual(summarizeFailures(summary.results), [
    "/health/cron: expected 200/ok but received http=503, status=degraded",
    "/missing: connect ECONNREFUSED",
  ]);
});

test("buildAlertPayload includes a concise failure summary plus structured details", () => {
  const payload = buildAlertPayload({
    environment: "production",
    summary: {
      checked_at: "2026-04-25T10:30:00.000Z",
      base_url: "https://api.example.com",
      failures: ["/health/cron: expected 200/ok but received http=503, status=degraded"],
      results: [
        {
          endpoint: "/health/cron",
          ok: false,
          http_status: 503,
          status: "degraded",
          engine_states: {
            session_engine: "stale",
          },
          error: null,
        },
      ],
    },
  });

  assert.match(payload.text, /\[production\] backend healthcheck failed/);
  assert.equal(payload.service, "gamegrub-backend");
  assert.equal(payload.failing_checks.length, 1);
  assert.equal(payload.failing_checks[0].endpoint, "/health/cron");
});
