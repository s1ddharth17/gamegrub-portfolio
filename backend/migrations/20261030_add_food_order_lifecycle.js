module.exports = {
  async up({ connection }) {
    await connection.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS accepted_at DATETIME NULL,
        ADD COLUMN IF NOT EXISTS preparing_at DATETIME NULL,
        ADD COLUMN IF NOT EXISTS ready_at DATETIME NULL,
        ADD COLUMN IF NOT EXISTS delivered_at DATETIME NULL,
        ADD COLUMN IF NOT EXISTS eta_at DATETIME NULL,
        ADD COLUMN IF NOT EXISTS eta_minutes INT UNSIGNED NULL,
        ADD COLUMN IF NOT EXISTS customer_notes VARCHAR(500) NULL
    `);

    await connection.query(`
      UPDATE orders
      SET accepted_at = COALESCE(accepted_at, created_at),
          preparing_at = CASE
            WHEN status IN ('preparing', 'completed', 'delivered')
              THEN COALESCE(preparing_at, updated_at)
            ELSE preparing_at
          END,
          ready_at = CASE
            WHEN status IN ('completed', 'delivered')
              THEN COALESCE(ready_at, updated_at)
            ELSE ready_at
          END,
          delivered_at = CASE
            WHEN status = 'delivered' THEN COALESCE(delivered_at, updated_at)
            ELSE delivered_at
          END
      WHERE accepted_at IS NULL
         OR (status IN ('preparing', 'completed', 'delivered') AND preparing_at IS NULL)
         OR (status IN ('completed', 'delivered') AND ready_at IS NULL)
         OR (status = 'delivered' AND delivered_at IS NULL)
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS order_status_history (
        history_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        order_id INT NOT NULL,
        previous_status VARCHAR(24) NULL,
        status VARCHAR(24) NOT NULL,
        changed_by_admin_id INT NULL,
        eta_at DATETIME NULL,
        changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (history_id),
        KEY idx_order_status_history_order (order_id, changed_at),
        KEY idx_order_status_history_admin (changed_by_admin_id, changed_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      INSERT INTO order_status_history (
        order_id, previous_status, status, changed_by_admin_id, eta_at, changed_at
      )
      SELECT
        o.order_id,
        NULL,
        CASE o.status
          WHEN 'active' THEN 'accepted'
          WHEN 'completed' THEN 'ready'
          WHEN 'closed' THEN 'closed'
          ELSE o.status
        END,
        NULL,
        o.eta_at,
        COALESCE(o.accepted_at, o.created_at, CURRENT_TIMESTAMP)
      FROM orders o
      WHERE NOT EXISTS (
        SELECT 1
        FROM order_status_history h
        WHERE h.order_id = o.order_id
          AND h.previous_status IS NULL
      )
    `);
  },
};
