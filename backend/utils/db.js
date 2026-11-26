const pool = require("../config/db");

const db = pool.promise();

async function query(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

async function withTransaction(work) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function withNamedLock(lockName, work, options = {}) {
  const timeoutSeconds = Number.isFinite(Number(options.timeoutSeconds))
    ? Math.max(0, Number(options.timeoutSeconds))
    : 0;
  const connection = await db.getConnection();
  let lockAcquired = false;

  try {
    const [rows] = await connection.query("SELECT GET_LOCK(?, ?) AS acquired", [
      String(lockName || "default-lock"),
      timeoutSeconds,
    ]);

    lockAcquired = Number(rows[0]?.acquired || 0) === 1;

    if (!lockAcquired) {
      const error = new Error(`Lock ${lockName} is already held by another worker.`);
      error.code = "LOCK_NOT_ACQUIRED";
      error.statusCode = 409;
      throw error;
    }

    return await work(connection);
  } finally {
    if (lockAcquired) {
      try {
        await connection.query("SELECT RELEASE_LOCK(?)", [String(lockName || "default-lock")]);
      } catch (_) {
        // Ignore release failures so the connection can still be returned to the pool.
      }
    }

    connection.release();
  }
}

module.exports = {
  db,
  pool,
  query,
  withTransaction,
  withNamedLock,
};
