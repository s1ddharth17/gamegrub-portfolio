const test = require("node:test");
const assert = require("node:assert/strict");

const { buildCronEngineHealth } = require("../cron/monitor");
const { CRON_ENGINES } = require("../cron/config");

const ENGINE = CRON_ENGINES.session_engine;

function run({
  status,
  startedAt,
  finishedAt = null,
  errorMessage = null,
  errorCode = null,
  summary = null,
}) {
  return {
    id: 17,
    runner_id: "runner-17",
    status,
    started_at: startedAt,
    finished_at: finishedAt,
    error_message: errorMessage,
    error_code: errorCode,
    summary_json: summary ? JSON.stringify(summary) : null,
    trigger_source: "test",
    scheduler_mode: "external_scheduler",
  };
}

test("buildCronEngineHealth marks a recent completed run as healthy", () => {
  const now = new Date("2026-04-22T10:02:00.000Z");
  const health = buildCronEngineHealth({
    engine: ENGINE,
    runs: [
      run({
        status: "completed",
        startedAt: new Date("2026-04-22T10:01:00.000Z"),
        finishedAt: new Date("2026-04-22T10:01:05.000Z"),
        summary: { started: 2, ended: 1 },
      }),
    ],
    now,
  });

  assert.equal(health.health, "healthy");
  assert.equal(health.last_run_id, 17);
  assert.equal(health.runner_id, "runner-17");
  assert.equal(health.last_run_status, "completed");
  assert.deepEqual(health.last_summary, { started: 2, ended: 1 });
});

test("buildCronEngineHealth marks a missing engine schedule as never_run", () => {
  const now = new Date("2026-04-22T10:02:00.000Z");
  const health = buildCronEngineHealth({
    engine: ENGINE,
    runs: [],
    now,
  });

  assert.equal(health.health, "never_run");
  assert.equal(health.last_run_status, null);
});

test("buildCronEngineHealth marks an overdue engine as stale", () => {
  const now = new Date("2026-04-22T10:05:00.000Z");
  const health = buildCronEngineHealth({
    engine: ENGINE,
    runs: [
      run({
        status: "completed",
        startedAt: new Date("2026-04-22T10:00:00.000Z"),
        finishedAt: new Date("2026-04-22T10:00:05.000Z"),
      }),
    ],
    now,
  });

  assert.equal(health.health, "stale");
});

test("buildCronEngineHealth marks repeated failures as failing", () => {
  const now = new Date("2026-04-22T10:02:00.000Z");
  const health = buildCronEngineHealth({
    engine: ENGINE,
    runs: [
      run({
        status: "failed",
        startedAt: new Date("2026-04-22T10:01:00.000Z"),
        finishedAt: new Date("2026-04-22T10:01:02.000Z"),
        errorMessage: "DB timeout",
        errorCode: "ER_LOCK_WAIT_TIMEOUT",
      }),
      run({
        status: "failed",
        startedAt: new Date("2026-04-22T10:00:00.000Z"),
        finishedAt: new Date("2026-04-22T10:00:02.000Z"),
        errorMessage: "DB timeout",
        errorCode: "ER_LOCK_WAIT_TIMEOUT",
      }),
    ],
    now,
  });

  assert.equal(health.health, "failing");
  assert.equal(health.consecutive_failures, 2);
  assert.equal(health.last_error_code, "ER_LOCK_WAIT_TIMEOUT");
});

test("buildCronEngineHealth marks a long-running engine as stuck", () => {
  const now = new Date("2026-04-22T10:10:00.000Z");
  const health = buildCronEngineHealth({
    engine: ENGINE,
    runs: [
      run({
        status: "running",
        startedAt: new Date("2026-04-22T10:00:00.000Z"),
      }),
    ],
    now,
  });

  assert.equal(health.health, "stuck");
});

test("trackCronRun attaches its durable run ID to a failed scheduler alert", async (t) => {
  const db = require("../utils/db");
  const operationalMetrics = require("../utils/operationalMetrics");
  const queryCalls = [];
  const recordedFailures = [];
  t.mock.method(db, "query", async (sql, params = []) => {
    queryCalls.push({ sql, params });
    return /INSERT INTO cron_job_runs/.test(sql) ? { insertId: 52 } : { affectedRows: 1 };
  });
  t.mock.method(operationalMetrics, "recordCronFailure", (failure) => {
    recordedFailures.push(failure);
  });

  const monitorPath = require.resolve("../cron/monitor");
  delete require.cache[monitorPath];
  t.after(() => delete require.cache[monitorPath]);
  const { trackCronRun } = require("../cron/monitor");
  const failure = Object.assign(new Error("scheduler work failed"), {
    code: "SCHEDULER_FAILURE",
  });

  await assert.rejects(
    trackCronRun(
      {
        engineName: ENGINE.name,
        triggerSource: "test",
        schedulerMode: "external_scheduler",
      },
      async () => {
        throw failure;
      }
    ),
    failure
  );

  assert.equal(queryCalls.length, 2);
  assert.match(queryCalls[1].sql, /status = \?/);
  assert.equal(recordedFailures.length, 1);
  assert.equal(recordedFailures[0].engineName, ENGINE.name);
  assert.equal(recordedFailures[0].runId, 52);
  assert.equal(recordedFailures[0].errorCode, "SCHEDULER_FAILURE");
});
