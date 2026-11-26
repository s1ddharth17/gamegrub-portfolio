const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const SESSION_ENGINE_PATH = path.join(__dirname, "..", "cron", "sessionEngine.js");
const NO_SHOW_ENGINE_PATH = path.join(__dirname, "..", "cron", "noShowEngine.js");

function createLoggerStub() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

function normalizeSql(sql) {
  return String(sql || "")
    .replace(/\s+/g, " ")
    .trim();
}

async function withMockedModule(targetPath, mocks, work) {
  const resolvedTarget = require.resolve(targetPath);
  const previousCacheEntries = new Map();

  try {
    for (const [modulePath, exports] of Object.entries(mocks)) {
      const resolvedModule = require.resolve(modulePath);
      previousCacheEntries.set(resolvedModule, require.cache[resolvedModule]);
      require.cache[resolvedModule] = {
        id: resolvedModule,
        filename: resolvedModule,
        loaded: true,
        exports,
      };
    }

    delete require.cache[resolvedTarget];
    const loadedModule = require(resolvedTarget);
    return await work(loadedModule);
  } finally {
    delete require.cache[resolvedTarget];

    for (const [resolvedModule, previousEntry] of previousCacheEntries.entries()) {
      if (previousEntry) {
        require.cache[resolvedModule] = previousEntry;
      } else {
        delete require.cache[resolvedModule];
      }
    }
  }
}

test("session engine processes catch-up closes, starts, finishes, and ignores unaffected bookings", async () => {
  let trackedRun = null;
  let lockInvocation = null;
  const finalizedConfirmedIds = [];
  const startedIds = [];
  const finishedRunningIds = [];
  const pcUpdates = [];

  const confirmedBookings = [
    { booking_id: 101, pc_id: 11, booking_date: "2026-04-22", start_hour: 9, end_hour: 11 },
    { booking_id: 102, pc_id: 12, booking_date: "2026-04-22", start_hour: 12, end_hour: 14 },
    { booking_id: 103, pc_id: 13, booking_date: "2026-04-22", start_hour: 18, end_hour: 20 },
  ];

  const runningBookings = [
    { booking_id: 201, pc_id: 21, booking_date: "2026-04-22", start_hour: 14, end_hour: 16 },
    { booking_id: 202, pc_id: 22, booking_date: "2026-04-22", start_hour: 16, end_hour: 18 },
  ];

  const connection = {
    async query(sql, params = []) {
      const normalizedSql = normalizeSql(sql);

      if (
        normalizedSql.includes("WHERE b.status='confirmed'") &&
        normalizedSql.includes("GROUP BY b.booking_id, b.pc_id, b.booking_date")
      ) {
        return [confirmedBookings];
      }

      if (
        normalizedSql.includes("WHERE b.status='running'") &&
        normalizedSql.includes("GROUP BY b.booking_id, b.pc_id, b.booking_date")
      ) {
        return [runningBookings];
      }

      if (
        normalizedSql.includes("SET status='session_over'") &&
        normalizedSql.includes("WHERE booking_id=? AND status='confirmed'")
      ) {
        finalizedConfirmedIds.push(params[2]);
        return [{ affectedRows: params[2] === 101 ? 1 : 0 }];
      }

      if (
        normalizedSql.includes("SET status='running'") &&
        normalizedSql.includes("WHERE booking_id=? AND status='confirmed'")
      ) {
        startedIds.push(params[1]);
        return [{ affectedRows: params[1] === 102 ? 1 : 0 }];
      }

      if (
        normalizedSql.includes("SET status='session_over'") &&
        normalizedSql.includes("WHERE booking_id=? AND status='running'")
      ) {
        finishedRunningIds.push(params[2]);
        return [{ affectedRows: params[2] === 201 ? 1 : 0 }];
      }

      if (
        normalizedSql.includes("UPDATE pc") &&
        normalizedSql.includes("SET status='occupied'")
      ) {
        pcUpdates.push({ status: "occupied", pcId: params[0] });
        return [{ affectedRows: 1 }];
      }

      if (
        normalizedSql.includes("UPDATE pc") &&
        normalizedSql.includes("SET status='active'")
      ) {
        pcUpdates.push({ status: "active", pcId: params[0] });
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Unexpected query in session engine test: ${normalizedSql}`);
    },
  };

  await withMockedModule(
    SESSION_ENGINE_PATH,
    {
      "../utils/db": {
        withNamedLock: async (lockName, work, options) => {
          lockInvocation = { lockName, options };
          return work(connection);
        },
      },
      "../cron/config": {
        CRON_ENGINES: {
          session_engine: {
            name: "session_engine",
            lockName: "cron:session-engine",
          },
        },
        getCronSchedulerMode: () => "external_scheduler",
      },
      "../cron/monitor": {
        trackCronRun: async (runDetails, work) => {
          trackedRun = runDetails;
          return work();
        },
      },
      "../utils/bookingSchedule": {
        determineConfirmedBookingAction: ({ startHour }) => {
          if (startHour === 9) {
            return "catch_up_close";
          }

          if (startHour === 12) {
            return "start";
          }

          return "none";
        },
        shouldFinishRunningBooking: ({ endHour }) => endHour === 16,
      },
      "../utils/logger": {
        logger: {
          child: () => createLoggerStub(),
        },
      },
    },
    async (runSessionEngine) => {
      const result = await runSessionEngine({
        triggerSource: "test_cli",
        schedulerMode: "manual_test",
      });

      assert.deepEqual(result, {
        ok: true,
        started: 1,
        catch_up_closed: 1,
        ended: 1,
      });
    }
  );

  assert.deepEqual(trackedRun, {
    engineName: "session_engine",
    triggerSource: "test_cli",
    schedulerMode: "manual_test",
    lockName: "cron:session-engine",
  });
  assert.deepEqual(lockInvocation, {
    lockName: "cron:session-engine",
    options: { timeoutSeconds: 0 },
  });
  assert.deepEqual(finalizedConfirmedIds, [101]);
  assert.deepEqual(startedIds, [102]);
  assert.deepEqual(finishedRunningIds, [201]);
  assert.deepEqual(pcUpdates, [
    { status: "active", pcId: 11 },
    { status: "occupied", pcId: 12 },
    { status: "active", pcId: 21 },
  ]);
});

test("session engine skips cleanly when another worker holds the lock", async () => {
  let trackedRun = null;

  await withMockedModule(
    SESSION_ENGINE_PATH,
    {
      "../utils/db": {
        withNamedLock: async () => {
          const error = new Error("busy");
          error.code = "LOCK_NOT_ACQUIRED";
          throw error;
        },
      },
      "../cron/config": {
        CRON_ENGINES: {
          session_engine: {
            name: "session_engine",
            lockName: "cron:session-engine",
          },
        },
        getCronSchedulerMode: () => "external_scheduler",
      },
      "../cron/monitor": {
        trackCronRun: async (runDetails, work) => {
          trackedRun = runDetails;
          return work();
        },
      },
      "../utils/bookingSchedule": {
        determineConfirmedBookingAction: () => "none",
        shouldFinishRunningBooking: () => false,
      },
      "../utils/logger": {
        logger: {
          child: () => createLoggerStub(),
        },
      },
    },
    async (runSessionEngine) => {
      const result = await runSessionEngine();

      assert.deepEqual(result, {
        ok: true,
        skipped: true,
        reason: "lock_busy",
      });
    }
  );

  assert.deepEqual(trackedRun, {
    engineName: "session_engine",
    triggerSource: "direct_cli",
    schedulerMode: "external_scheduler",
    lockName: "cron:session-engine",
  });
});

test("no-show engine cancels overdue bookings and skips cleanup when the booking was already changed", async () => {
  let trackedRun = null;
  let lockInvocation = null;
  const cancelledBookingIds = [];
  const deletedSlotBookingIds = [];
  const cancelledPaymentBookingIds = [];
  const activatedPcIds = [];

  const bookings = [
    { booking_id: 301, pc_id: 31, start_hour: 10 },
    { booking_id: 302, pc_id: 32, start_hour: 11 },
    { booking_id: 303, pc_id: 33, start_hour: 12 },
  ];

  const connection = {
    async query(sql, params = []) {
      const normalizedSql = normalizeSql(sql);

      if (
        normalizedSql.includes("WHERE b.status='confirmed'") &&
        normalizedSql.includes("AND b.checked_in_at IS NULL") &&
        normalizedSql.includes("DATE_ADD(UTC_DATE(), INTERVAL 1 DAY)")
      ) {
        return [bookings];
      }

      if (
        normalizedSql.includes("UPDATE booking") &&
        normalizedSql.includes("SET status='cancelled'") &&
        normalizedSql.includes("WHERE booking_id=? AND status='confirmed' AND checked_in_at IS NULL")
      ) {
        cancelledBookingIds.push(params[0]);
        return [{ affectedRows: params[0] === 301 ? 1 : 0 }];
      }

      if (normalizedSql.startsWith("DELETE FROM booking_slots")) {
        deletedSlotBookingIds.push(params[0]);
        return [{ affectedRows: 2 }];
      }

      if (
        normalizedSql.includes("UPDATE payments") &&
        normalizedSql.includes("SET status='cancelled', gateway_status='cancelled'")
      ) {
        cancelledPaymentBookingIds.push(params[0]);
        return [{ affectedRows: 1 }];
      }

      if (
        normalizedSql.includes("UPDATE pc") &&
        normalizedSql.includes("SET status='active'")
      ) {
        activatedPcIds.push(params[0]);
        return [{ affectedRows: 1 }];
      }

      throw new Error(`Unexpected query in no-show engine test: ${normalizedSql}`);
    },
  };

  await withMockedModule(
    NO_SHOW_ENGINE_PATH,
    {
      "../utils/db": {
        withNamedLock: async (lockName, work, options) => {
          lockInvocation = { lockName, options };
          return work(connection);
        },
      },
      "../cron/config": {
        CRON_ENGINES: {
          no_show_engine: {
            name: "no_show_engine",
            lockName: "cron:no-show-engine",
          },
        },
        getCronSchedulerMode: () => "external_scheduler",
      },
      "../cron/monitor": {
        trackCronRun: async (runDetails, work) => {
          trackedRun = runDetails;
          return work();
        },
      },
      "../utils/bookingSchedule": {
        shouldCancelNoShowBooking: ({ startHour }) => startHour !== 11,
      },
      "../utils/logger": {
        logger: {
          child: () => createLoggerStub(),
        },
      },
    },
    async (runNoShowEngine) => {
      const result = await runNoShowEngine({
        triggerSource: "test_cli",
        schedulerMode: "manual_test",
      });

      assert.deepEqual(result, {
        ok: true,
        cancelled: 1,
      });
    }
  );

  assert.deepEqual(trackedRun, {
    engineName: "no_show_engine",
    triggerSource: "test_cli",
    schedulerMode: "manual_test",
    lockName: "cron:no-show-engine",
  });
  assert.deepEqual(lockInvocation, {
    lockName: "cron:no-show-engine",
    options: { timeoutSeconds: 0 },
  });
  assert.deepEqual(cancelledBookingIds, [301, 303]);
  assert.deepEqual(deletedSlotBookingIds, [301]);
  assert.deepEqual(cancelledPaymentBookingIds, [301]);
  assert.deepEqual(activatedPcIds, [31]);
});

test("no-show engine skips cleanly when another worker holds the lock", async () => {
  let trackedRun = null;

  await withMockedModule(
    NO_SHOW_ENGINE_PATH,
    {
      "../utils/db": {
        withNamedLock: async () => {
          const error = new Error("busy");
          error.code = "LOCK_NOT_ACQUIRED";
          throw error;
        },
      },
      "../cron/config": {
        CRON_ENGINES: {
          no_show_engine: {
            name: "no_show_engine",
            lockName: "cron:no-show-engine",
          },
        },
        getCronSchedulerMode: () => "external_scheduler",
      },
      "../cron/monitor": {
        trackCronRun: async (runDetails, work) => {
          trackedRun = runDetails;
          return work();
        },
      },
      "../utils/bookingSchedule": {
        shouldCancelNoShowBooking: () => false,
      },
      "../utils/logger": {
        logger: {
          child: () => createLoggerStub(),
        },
      },
    },
    async (runNoShowEngine) => {
      const result = await runNoShowEngine();

      assert.deepEqual(result, {
        ok: true,
        skipped: true,
        reason: "lock_busy",
      });
    }
  );

  assert.deepEqual(trackedRun, {
    engineName: "no_show_engine",
    triggerSource: "direct_cli",
    schedulerMode: "external_scheduler",
    lockName: "cron:no-show-engine",
  });
});
