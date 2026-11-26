const DEFAULT_ENDPOINTS = ["/health", "/api/health", "/health/cron", "/api/health/cron"];
const DEFAULT_TIMEOUT_MS = 10000;

function parseEndpointList(value) {
  const parsed = String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return parsed.length > 0 ? parsed : [...DEFAULT_ENDPOINTS];
}

function normalizeBaseUrl(value) {
  const trimmed = String(value || "").trim();

  if (!trimmed) {
    throw new Error("HEALTHCHECK_BASE_URL is required.");
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function toAbsoluteUrl(baseUrl, endpointPath) {
  const normalizedPath = String(endpointPath || "").trim();
  return `${baseUrl}${normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`}`;
}

function safeJsonParse(value) {
  try {
    return {
      ok: true,
      value: JSON.parse(value),
    };
  } catch (error) {
    return {
      ok: false,
      error,
    };
  }
}

function buildCheckResult({ endpointPath, url, responseStatus, payload, errorMessage }) {
  const statusValue = payload && typeof payload === "object" ? payload.status : null;
  const isOk = !errorMessage && responseStatus === 200 && statusValue === "ok";
  const engineStates =
    payload && payload.engines && typeof payload.engines === "object"
      ? Object.fromEntries(
          Object.entries(payload.engines).map(([engineName, health]) => [
            engineName,
            health?.health || null,
          ])
        )
      : null;

  return {
    endpoint: endpointPath,
    url,
    ok: isOk,
    http_status: responseStatus,
    status: statusValue,
    in_process_cron:
      payload && typeof payload === "object" && Object.hasOwn(payload, "in_process_cron")
        ? Boolean(payload.in_process_cron)
        : null,
    scheduler_mode:
      payload && typeof payload === "object" && typeof payload.scheduler_mode === "string"
        ? payload.scheduler_mode
        : null,
    engine_states: engineStates,
    error: errorMessage || null,
  };
}

async function fetchEndpointHealth({
  baseUrl,
  endpointPath,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
}) {
  const url = toAbsoluteUrl(baseUrl, endpointPath);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    const rawBody = await response.text();
    const parsed = safeJsonParse(rawBody);

    if (!parsed.ok) {
      return buildCheckResult({
        endpointPath,
        url,
        responseStatus: response.status,
        payload: null,
        errorMessage: `Expected JSON response but received: ${rawBody.slice(0, 200)}`,
      });
    }

    return buildCheckResult({
      endpointPath,
      url,
      responseStatus: response.status,
      payload: parsed.value,
      errorMessage: null,
    });
  } catch (error) {
    const message =
      error?.name === "AbortError"
        ? `Request timed out after ${timeoutMs}ms`
        : error?.message || "Unknown request failure";

    return buildCheckResult({
      endpointPath,
      url,
      responseStatus: null,
      payload: null,
      errorMessage: message,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function summarizeFailures(results) {
  return results
    .filter((result) => !result.ok)
    .map((result) => {
      if (result.error) {
        return `${result.endpoint}: ${result.error}`;
      }

      return `${result.endpoint}: expected 200/ok but received http=${result.http_status}, status=${result.status}`;
    });
}

async function runHealthChecks({
  baseUrl,
  endpointPaths = DEFAULT_ENDPOINTS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const checks = [];

  for (const endpointPath of endpointPaths) {
    checks.push(
      await fetchEndpointHealth({
        baseUrl: normalizedBaseUrl,
        endpointPath,
        timeoutMs,
        fetchImpl,
      })
    );
  }

  const failures = summarizeFailures(checks);

  return {
    ok: failures.length === 0,
    checked_at: new Date().toISOString(),
    base_url: normalizedBaseUrl,
    results: checks,
    failures,
  };
}

function buildAlertPayload({ environment, summary }) {
  const failingChecks = summary.results.filter((result) => !result.ok);
  const failureText =
    summary.failures.length > 0 ? summary.failures.join(" | ") : "Unknown healthcheck failure";
  const text = `[${environment}] backend healthcheck failed: ${failureText}`;

  return {
    text,
    content: text,
    summary: text,
    service: "gamegrub-backend",
    environment,
    checked_at: summary.checked_at,
    base_url: summary.base_url,
    failing_checks: failingChecks,
  };
}

async function sendAlert({ webhookUrl, payload, fetchImpl = fetch }) {
  const response = await fetchImpl(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const rawBody = await response.text();
    throw new Error(
      `Alert webhook responded with HTTP ${response.status}: ${rawBody.slice(0, 200)}`
    );
  }
}

async function main() {
  const summary = await runHealthChecks({
    baseUrl: process.env.HEALTHCHECK_BASE_URL,
    endpointPaths: parseEndpointList(process.env.HEALTHCHECK_ENDPOINTS),
    timeoutMs: Number(process.env.HEALTHCHECK_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  });

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (summary.ok) {
    return;
  }

  const webhookUrl = String(process.env.HEALTHCHECK_ALERT_WEBHOOK_URL || "").trim();
  if (webhookUrl) {
    const payload = buildAlertPayload({
      environment:
        String(process.env.HEALTHCHECK_ENVIRONMENT || "").trim() ||
        String(process.env.APP_ENV || process.env.NODE_ENV || "unknown").trim() ||
        "unknown",
      summary,
    });

    await sendAlert({
      webhookUrl,
      payload,
    });
  }

  const error = new Error(summary.failures.join("; "));
  error.code = "HEALTHCHECK_FAILED";
  throw error;
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message || error}\n`);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_ENDPOINTS,
  DEFAULT_TIMEOUT_MS,
  buildAlertPayload,
  buildCheckResult,
  fetchEndpointHealth,
  normalizeBaseUrl,
  parseEndpointList,
  runHealthChecks,
  sendAlert,
  summarizeFailures,
  toAbsoluteUrl,
};
