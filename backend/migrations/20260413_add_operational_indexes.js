module.exports = {
  description: "Add indexes for booking, payment, loyalty, and billing queries.",
  transaction: false,
  async up({ ensureIndex, logger }) {
    const operations = [
      ["booking", "idx_booking_status_date", ["status", "booking_date"]],
      ["booking", "idx_booking_user_date_status", ["user_id", "booking_date", "status"]],
      ["booking_slots", "idx_booking_slots_pc_date_hour", ["pc_id", "booking_date", "hour"]],
      ["payments", "idx_payments_booking_status", ["booking_id", "status"]],
      ["bills", "idx_bills_user_created_at", ["user_id", "created_at"]],
      [
        "loyalty_transactions",
        "idx_loyalty_user_created_at",
        ["user_id", "created_at"],
      ],
    ];

    for (const [tableName, indexName, columns] of operations) {
      const created = await ensureIndex(tableName, indexName, columns);
      logger.info("migration_index_checked", {
        table_name: tableName,
        index_name: indexName,
        created,
      });
    }
  },
};
