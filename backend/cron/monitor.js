const { randomUUID } = require("node:crypto");

const { query } = require("../utils/db");
const { logger } = require("../utils/logger");
const {
  recordCronFailure,
  recordCronHealthIssue,
} = require("../utils/operationalMetrics");
const {
  CRON_ENGINES,
  getCronRunningTimeoutMs,
  getCronSchedulerMode,
  getCronStaleAfterMs,
  isInProcessCronEnabled,
} = require("./config");

const CRON_RUNS_TABLE = "cron_job_runs";
const SUCCESS_STATUSES = new Set(["completed", "skipped"]);
const monitorLogger = logger.child({ component: "cron", engine: "monitor" });

let missingCronRunsTableWarned = false;

function serializePayload(value) {
  if (value === undefined) {
    return null;
  }

  try {
    return JSON.stringify(value);
  } catch (_) {
    return JSON.stringify({ serialization_error: true });
  }
}

function parseJsonPayload(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function toIsoString(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function differenceMs(from, to) {
  if (!from || !to) {
    return null;
  }

  const fromDate = from instanceof Date ? from : new Date(from);
  const toDate = to instanceof Date ? to : new Date(to);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return null;
  }

  return Math.max(0, toDate.getTime() - fromDate.getTime());
}

function isCronRunsTableMissingError(error) {
  return (
    String(error?.code || "").trim() === "ER_NO_SUCH_TABLE" ||
    /cron_job_runs/i.test(String(error?.message || "")) ||
    /doesn't exist/i.test(String(error?.message || ""))
  );
}

function logMonitoringUnavailable(error) {
  if (isCronRunsTableMissingError(error) && missingCronRunsTableWarned) {
    return;
  }

  if (isCronRunsTableMissingError(error)) {
    missingCronRunsTableWarned = true;
  }

  monitorLogger.warn("cron_monitoring_unavailable", {
    reason: isCronRunsTableMissingError(error) ? "table_missing" : "write_failed",
    error,
  });
}

async function startCronRun({ engineName, triggerSource, schedulerMode, lockName = null }) {
  const runnerId = randomUUID();
  const startedAt = new Date();

  try {
    const result = await query(
      `
        INSERT INTO ${CRON_RUNS_TABLE} (
          engine_name,
          status,
          trigger_source,
          scheduler_mode,
          runner_id,
          lock_name,
          started_at,
          created_at,
          updated_at
        )
        VALUES (?, 'running', ?, ?, ?, ?, ?, NOW(), NOW())
      `,
      [
        engineName,
        String(triggerSource || "unknown"),
        String(schedulerMode || getCronSchedulerMode()),
        runnerId,
        lockName,
        startedAt,
      ]
    );

    return {
      runId: Number(result.insertId || 0),
      runnerId,
      startedAt,
    };
  } catch (error) {
    logMonitoringUnavailable(error);
    return {
      runId: null,
      runnerId,
      startedAt,
    };
  }
}

async function finishCronRun(runId, { status, startedAt, summary = null, error = null }) {
  if (!runId) {
    return;
  }

  const finishedAt = new Date();
  const durationMs = differenceMs(startedAt, finishedAt);

  try {
    await query(
      `
        UPDATE ${CRON_RUNS_TABLE}
        SET
          status = ?,
          finished_at = ?,
          duration_ms = ?,
          summary_json = ?,
          error_message = ?,
          error_code = ?,
          updated_at = NOW()
        WHERE id = ?
      `,
      [
        String(status || "completed"),
        finishedAt,
        durationMs,
        serializePayload(summary),
        error ? String(error.message || "").slice(0, 500) : null,
        error ? String(error.code || error.name || "").slice(0, 80) : null,
        runId,
      ]
    );
  } catch (updateError) {
    logMonitoringUnavailable(updateError);
  }
}

async function trackCronRun(metadata, work) {
  const startedRun = await startCronRun(metadata);

  try {
    const summary = await work();
    await finishCronRun(startedRun.runId, {
      status: summary?.skipped ? "skipped" : "completed",
      startedAt: startedRun.startedAt,
      summary,
    });
    return summary;
  } catch (error) {
    await finishCronRun(startedRun.runId, {
      status: "failed",
      startedAt: startedRun.startedAt,
      error,
    });
    recordCronFailure({
      engineName: metadata.engineName,
      runId: startedRun.runId,
      runnerId: startedRun.runnerId,
      errorCode: error.code || error.name,
    });
    throw error;
  }
}

function buildCronEngineHealth({ engine, runs, now = new Date() }) {
  const latestRun = runs[0] || null;
  const latestHealthyRun = runs.find((run) => SUCCESS_STATUSES.has(run.status)) || null;
  const staleAfterMs = getCronStaleAfterMs(engine.intervalMs);
  const runningTimeoutMs = getCronRunningTimeoutMs(engine.intervalMs);
  const lastHealthyAt = latestHealthyRun?.finished_at || latestHealthyRun?.started_at || null;
  const latestStartedAt = latestRun?.started_at || null;
  const latestFinishedAt = latestRun?.finished_at || null;
  const lastHealthyAgeMs = differenceMs(lastHealthyAt, now);
  const latestRunningAgeMs =
    latestRun?.status === "running" ? differenceMs(latestStartedAt, now) : null;

  let health = "healthy";

  if (!latestRun) {
    health = "never_run";
  } else if (latestRun.status === "running" && (latestRunningAgeMs || 0) > runningTimeoutMs) {
    health = "stuck";
  } else if (!lastHealthyAt) {
    health = latestRun.status === "failed" ? "failing" : "never_run";
  } else if ((lastHealthyAgeMs || 0) > staleAfterMs) {
    health = "stale";
  } else if (latestRun.status === "failed") {
    health = "failing";
  }

  let consecutiveFailures = 0;
  for (const run of runs) {
    if (run.status !== "failed") {
      break;
    }
    consecutiveFailures += 1;
  }

  return {
    engine_name: engine.name,
    label: engine.label,
    health,
    last_run_id: latestRun?.id ? Number(latestRun.id) : null,
    runner_id: latestRun?.runner_id || null,
    expected_interval_ms: engine.intervalMs,
    stale_after_ms: staleAfterMs,
    running_timeout_ms: runningTimeoutMs,
    last_run_status: latestRun?.status || null,
    last_started_at: toIsoString(latestStartedAt),
    last_finished_at: toIsoString(latestFinishedAt),
    last_healthy_at: toIsoString(lastHealthyAt),
    last_summary: parseJsonPayload(latestRun?.summary_json),
    last_error_message: latestRun?.error_message || null,
    last_error_code: latestRun?.error_code || null,
    trigger_source: latestRun?.trigger_source || null,
    scheduler_mode: latestRun?.scheduler_mode || null,
    consecutive_failures: consecutiveFailures,
  };
}

async function listRecentRunsByEngine(engineName, limit = 20) {
  return query(
    `
      SELECT
        id,
        engine_name,
        status,
        trigger_source,
        scheduler_mode,
        runner_id,
        lock_name,
        summary_json,
        error_message,
        error_code,
        started_at,
        finished_at,
        duration_ms
      FROM ${CRON_RUNS_TABLE}
      WHERE engine_name = ?
      ORDER BY started_at DESC, id DESC
      LIMIT ${Math.max(1, Number(limit || 20))}
    `,
    [engineName]
  );
}

async function getCronHealthSnapshot({ now = new Date() } = {}) {
  try {
    const engineEntries = await Promise.all(
      Object.values(CRON_ENGINES).map(async (engine) => [
        engine.name,
        await listRecentRunsByEngine(engine.name, 20),
      ])
    );

    const engines = Object.fromEntries(
      engineEntries.map(([engineName, rows]) => [
        engineName,
        buildCronEngineHealth({
          engine: CRON_ENGINES[engineName],
          runs: rows,
          now,
        }),
      ])
    );

    for (const engine of Object.values(engines)) {
      if (engine.health !== "healthy") {
        recordCronHealthIssue({
          engineName: engine.engine_name,
          health: engine.health,
          runId: engine.last_run_id,
          runnerId: engine.runner_id,
          errorCode: engine.last_error_code,
        });
      }
    }

    const overallStatus = Object.values(engines).every((engine) => engine.health === "healthy")
      ? "ok"
      : "degraded";

    return {
      status: overallStatus,
      checked_at: now.toISOString(),
      scheduler_mode: getCronSchedulerMode(),
      in_process_cron: isInProcessCronEnabled(),
      monitoring: "database",
      engines,
    };
  } catch (error) {
    if (isCronRunsTableMissingError(error)) {
      recordCronHealthIssue({
        engineName: "cron_monitor",
        health: "monitoring_unavailable",
        errorCode: "cron_job_runs_table_missing",
      });
      return {
        status: "degraded",
        checked_at: now.toISOString(),
        scheduler_mode: getCronSchedulerMode(),
        in_process_cron: isInProcessCronEnabled(),
        monitoring: "unavailable",
        reason: "cron_job_runs_table_missing",
        engines: {},
      };
    }

    recordCronHealthIssue({
      engineName: "cron_monitor",
      health: "monitoring_unavailable",
      errorCode: error.code || error.name,
    });
    throw error;
  }
}

module.exports = {
  buildCronEngineHealth,
  getCronHealthSnapshot,
  trackCronRun,
};
