module.exports = {
  async up({ connection, ensureIndex }) {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS support_issues (
        issue_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        issue_number VARCHAR(40) NOT NULL,
        user_id BIGINT UNSIGNED NOT NULL,
        business_id INT NOT NULL,
        booking_id BIGINT UNSIGNED NULL,
        order_id BIGINT UNSIGNED NULL,
        bill_id BIGINT UNSIGNED NULL,
        category VARCHAR(32) NOT NULL DEFAULT 'other',
        subject VARCHAR(160) NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'open',
        priority VARCHAR(16) NOT NULL DEFAULT 'normal',
        assigned_admin_id INT NULL,
        resolution_summary VARCHAR(1000) NULL,
        resolved_at DATETIME NULL,
        closed_at DATETIME NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_support_issue_number (issue_number)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS support_issue_events (
        event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        issue_id BIGINT UNSIGNED NOT NULL,
        actor_type VARCHAR(16) NOT NULL,
        actor_id BIGINT UNSIGNED NULL,
        event_type VARCHAR(32) NOT NULL,
        message TEXT NULL,
        old_value LONGTEXT NULL,
        new_value LONGTEXT NULL,
        is_internal TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS support_faqs (
        faq_id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        faq_key VARCHAR(100) NOT NULL,
        business_id INT NULL,
        question VARCHAR(300) NOT NULL,
        answer TEXT NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_support_faq_key (faq_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    const faqs = [
      ["booking-change", "How can I change or cancel a booking?", "Open Session or your booking history and choose the booking action shown for that reservation. Paid booking cancellations follow the refund rules shown during cancellation."],
      ["food-order", "Where can I track a food order?", "Open Session to see kitchen progress and estimated preparation time. For a completed order, open its bill to view the receipt and request a refund review."],
      ["refund-status", "How do I check a refund?", "Refund requests appear in the bill or booking details and in Help & support. The cafe team reviews offline refunds; online refunds return to the original payment method after processing."],
      ["payment-help", "What should I do if a payment looks wrong?", "Create a support request from the relevant booking, order, or bill. Include the receipt or refund reference if you have one."],
      ["contact-cafe", "How do I contact this cafe?", "Cafe phone and email details appear in its profile when provided. You can always send the cafe a message through Help & support."],
    ];
    for (let index = 0; index < faqs.length; index += 1) {
      const [faqKey, question, answer] = faqs[index];
      await connection.query(
        `INSERT INTO support_faqs (faq_key, question, answer, sort_order, is_active)
         SELECT ?, ?, ?, ?, 1 FROM DUAL
         WHERE NOT EXISTS (SELECT 1 FROM support_faqs WHERE faq_key = ?)`,
        [faqKey, question, answer, (index + 1) * 10, faqKey]
      );
    }

    await ensureIndex("support_issues", "idx_support_user_updated", ["user_id", "updated_at"]);
    await ensureIndex("support_issues", "idx_support_business_status_updated", ["business_id", "status", "updated_at"]);
    await ensureIndex("support_issues", "idx_support_assigned_status", ["assigned_admin_id", "status", "updated_at"]);
    await ensureIndex("support_issue_events", "idx_support_event_issue_created", ["issue_id", "created_at"]);
    await ensureIndex("support_faqs", "idx_support_faq_business_active_order", ["business_id", "is_active", "sort_order"]);
  },
};
