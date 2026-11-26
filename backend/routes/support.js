const crypto = require("node:crypto");
const express = require("express");

const adminAuth = require("../middleware/adminAuth");
const auth = require("../middleware/auth");
const { ADMIN_PERMISSIONS } = require("../utils/adminAccess");
const {
  requireAdminBusinessAccess,
  resolveScopedAdminBusinessId,
} = require("../utils/businessAccess");
const { query, withTransaction } = require("../utils/db");

const router = express.Router();
const ISSUE_CATEGORIES = new Set(["booking", "order", "refund", "payment", "service", "other"]);
const ISSUE_STATUSES = new Set(["open", "assigned", "awaiting_customer", "resolved", "closed"]);
const ISSUE_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

function makeError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function normalizeId(value) {
  const parsed = Number(value || 0);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function parseJson(value) {
  if (value == null || value === "") return null;
  try { return JSON.parse(value); } catch (_) { return value; }
}

async function selectRows(executor, sql, params = []) {
  if (executor?.query) {
    const [rows] = await executor.query(sql, params);
    return rows;
  }
  return query(sql, params);
}

async function writeEvent(connection, {
  issueId,
  actorType,
  actorId,
  eventType,
  message = null,
  oldValue = null,
  newValue = null,
  isInternal = false,
}) {
  await connection.query(
    `INSERT INTO support_issue_events (
      issue_id, actor_type, actor_id, event_type, message, old_value, new_value, is_internal
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [issueId, actorType, actorId || null, eventType, message,
      oldValue == null ? null : JSON.stringify(oldValue),
      newValue == null ? null : JSON.stringify(newValue), isInternal ? 1 : 0]
  );
}

function serializeEvent(row) {
  return {
    event_id: Number(row.event_id),
    issue_id: Number(row.issue_id),
    actor_type: row.actor_type,
    actor_id: row.actor_id == null ? null : Number(row.actor_id),
    actor_name: row.actor_name || (row.actor_type === "admin" ? "Cafe support" : "Customer"),
    event_type: row.event_type,
    message: row.message || "",
    old_value: parseJson(row.old_value),
    new_value: parseJson(row.new_value),
    is_internal: Boolean(Number(row.is_internal || 0)),
    created_at: row.created_at,
  };
}

async function getIssue(issueId, executor, { includeInternal = false } = {}) {
  const rows = await selectRows(
    executor,
    `SELECT i.*, b.name AS business_name, b.phone AS business_phone,
        b.contact_email AS business_contact_email, b.city AS business_city,
        u.name AS customer_name,
        assigned.name AS assigned_admin_name
     FROM support_issues i
     JOIN businesses b ON b.business_id=i.business_id
     JOIN users u ON u.uid=i.user_id
     LEFT JOIN admin assigned ON assigned.id=i.assigned_admin_id
     WHERE i.issue_id=? LIMIT 1`,
    [issueId]
  );
  const issue = rows[0];
  if (!issue) return null;
  const eventRows = await selectRows(
    executor,
    `SELECT e.event_id, e.issue_id, e.actor_type, e.actor_id, e.event_type,
        e.message, e.old_value, e.new_value, e.is_internal, e.created_at,
        CASE WHEN e.actor_type='admin' THEN ${includeInternal ? "a.name" : "'Cafe support'"} WHEN e.actor_type='user' THEN customer.name ELSE 'GameGrub' END AS actor_name
     FROM support_issue_events e
     LEFT JOIN admin a ON e.actor_type='admin' AND a.id=e.actor_id
     LEFT JOIN users customer ON e.actor_type='user' AND customer.uid=e.actor_id
     WHERE e.issue_id=? ${includeInternal ? "" : "AND e.is_internal=0"}
     ORDER BY e.event_id ASC`,
    [issueId]
  );
  return {
    ...issue,
    issue_id: Number(issue.issue_id),
    user_id: Number(issue.user_id),
    business_id: Number(issue.business_id),
    booking_id: issue.booking_id == null ? null : Number(issue.booking_id),
    order_id: issue.order_id == null ? null : Number(issue.order_id),
    bill_id: issue.bill_id == null ? null : Number(issue.bill_id),
    assigned_admin_id: issue.assigned_admin_id == null ? null : Number(issue.assigned_admin_id),
    priority: issue.priority || "normal",
    events: eventRows.map(serializeEvent),
  };
}

function customerSafeIssue(issue) {
  if (!issue) return issue;
  const { customer_email, assigned_admin_name, assigned_admin_id, user_id, ...safeIssue } = issue;
  return safeIssue;
}

async function resolveCustomerContext(connection, userId, body) {
  const bookingId = normalizeId(body.booking_id);
  const orderId = normalizeId(body.order_id);
  const billId = normalizeId(body.bill_id);
  const contexts = [];

  if (bookingId) {
    const rows = await selectRows(connection,
      "SELECT booking_id, business_id, user_id FROM booking WHERE booking_id=? LIMIT 1",
      [bookingId]);
    if (!rows.length) makeError("Booking not found.", 404);
    if (Number(rows[0].user_id) !== userId) makeError("You do not have access to this booking.", 403);
    contexts.push({ kind: "booking", id: bookingId, booking_id: bookingId, business_id: Number(rows[0].business_id) });
  }

  if (orderId) {
    const rows = await selectRows(connection,
      `SELECT o.order_id, o.booking_id, o.business_id, b.user_id
       FROM orders o JOIN booking b ON b.booking_id=o.booking_id
       WHERE o.order_id=? LIMIT 1`, [orderId]);
    if (!rows.length) makeError("Order not found.", 404);
    if (Number(rows[0].user_id) !== userId) makeError("You do not have access to this order.", 403);
    contexts.push({ kind: "order", id: orderId, booking_id: Number(rows[0].booking_id), business_id: Number(rows[0].business_id) });
  }

  if (billId) {
    const rows = await selectRows(connection,
      "SELECT bill_id, booking_id, business_id, user_id FROM bills WHERE bill_id=? LIMIT 1",
      [billId]);
    if (!rows.length) makeError("Bill not found.", 404);
    if (Number(rows[0].user_id) !== userId) makeError("You do not have access to this bill.", 403);
    contexts.push({ kind: "bill", id: billId, booking_id: Number(rows[0].booking_id), business_id: Number(rows[0].business_id) });
  }

  if (!contexts.length) {
    const requestedBusinessId = normalizeId(body.business_id);
    if (!requestedBusinessId) makeError("Open Help from a cafe, booking, order, or bill.");
    const rows = await selectRows(connection,
      `SELECT business_id FROM businesses WHERE business_id=? AND status='active' AND listing_status='listed' LIMIT 1`,
      [requestedBusinessId]);
    if (!rows.length) makeError("Cafe not found.", 404);
    return { businessId: requestedBusinessId, bookingId: null, orderId: null, billId: null };
  }

  const businessId = contexts[0].business_id;
  const contextBookingId = contexts.find((item) => item.booking_id)?.booking_id || null;
  if (contexts.some((item) => item.business_id !== businessId)) {
    makeError("The selected booking, order, and bill must belong to the same cafe.");
  }
  if (contexts.some((item) => item.booking_id && contextBookingId && item.booking_id !== contextBookingId)) {
    makeError("The selected order and bill must belong to the same booking.");
  }
  const requestedBusinessId = normalizeId(body.business_id);
  if (requestedBusinessId && requestedBusinessId !== businessId) {
    makeError("The support request cafe does not match the selected record.", 403);
  }
  return {
    businessId,
    bookingId: contextBookingId,
    orderId: contexts.find((item) => item.kind === "order")?.id || null,
    billId: contexts.find((item) => item.kind === "bill")?.id || null,
  };
}

function validateIssueInput(body) {
  const category = String(body.category || "other").trim().toLowerCase();
  const subject = String(body.subject || "").trim();
  const description = String(body.description || "").trim();
  if (!ISSUE_CATEGORIES.has(category)) makeError("Choose a valid support category.");
  if (subject.length < 4 || subject.length > 160) makeError("Subject must be between 4 and 160 characters.");
  if (description.length < 10 || description.length > 4000) makeError("Describe the issue in 10 to 4000 characters.");
  return { category, subject, description };
}

async function loadAdminIssue(issueId, req) {
  const issueRows = await query("SELECT issue_id, business_id FROM support_issues WHERE issue_id=? LIMIT 1", [issueId]);
  if (!issueRows[0]) makeError("Support request not found.", 404);
  await requireAdminBusinessAccess(req.admin, Number(issueRows[0].business_id));
  return issueRows[0];
}

router.get("/faqs", async (req, res) => {
  try {
    const businessId = normalizeId(req.query?.business_id);
    const rows = await query(
      `SELECT faq_id, faq_key, business_id, question, answer
       FROM support_faqs WHERE is_active=1 AND (business_id IS NULL OR business_id=?)
       ORDER BY business_id IS NULL DESC, sort_order ASC, faq_id ASC`,
      [businessId || -1]
    );
    return res.json(rows.map((row) => ({ ...row, faq_id: Number(row.faq_id), business_id: row.business_id == null ? null : Number(row.business_id) })));
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get("/issues", auth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT i.issue_id, i.issue_number, i.business_id, i.category, i.subject, i.status,
          i.priority, i.created_at, i.updated_at, b.name AS business_name,
          (SELECT e.message FROM support_issue_events e
           WHERE e.issue_id=i.issue_id AND e.is_internal=0
           ORDER BY e.event_id DESC LIMIT 1) AS latest_update
       FROM support_issues i JOIN businesses b ON b.business_id=i.business_id
       WHERE i.user_id=? ORDER BY i.updated_at DESC, i.issue_id DESC LIMIT 100`,
      [Number(req.user.id)]
    );
    return res.json(rows.map((row) => ({ ...row, issue_id: Number(row.issue_id), business_id: Number(row.business_id) })));
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.post("/issues", auth, async (req, res) => {
  try {
    const input = validateIssueInput(req.body || {});
    const userId = Number(req.user.id);
    const created = await withTransaction(async (connection) => {
      const context = await resolveCustomerContext(connection, userId, req.body || {});
      const issueNumber = `GGH-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      const [result] = await connection.query(
        `INSERT INTO support_issues (
          issue_number, user_id, business_id, booking_id, order_id, bill_id,
          category, subject, description, status, priority
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 'normal')`,
        [issueNumber, userId, context.businessId, context.bookingId, context.orderId,
          context.billId, input.category, input.subject, input.description]
      );
      await writeEvent(connection, {
        issueId: result.insertId, actorType: "user", actorId: userId,
        eventType: "created", message: "Support request submitted.",
        newValue: { status: "open", category: input.category },
      });
      return customerSafeIssue(await getIssue(result.insertId, connection));
    });
    return res.status(201).json({ message: "Support request submitted.", issue: created });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get("/issues/:id", auth, async (req, res) => {
  try {
    const issueId = normalizeId(req.params.id);
    if (!issueId) makeError("Valid support request id required.");
    const rows = await query("SELECT issue_id, user_id FROM support_issues WHERE issue_id=? LIMIT 1", [issueId]);
    if (!rows[0]) makeError("Support request not found.", 404);
    if (Number(rows[0].user_id) !== Number(req.user.id)) makeError("You do not have access to this support request.", 403);
    const issue = await getIssue(issueId, null);
    return res.json(customerSafeIssue(issue));
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.post("/issues/:id/comments", auth, async (req, res) => {
  try {
    const issueId = normalizeId(req.params.id);
    const message = String(req.body?.message || "").trim();
    if (!issueId) makeError("Valid support request id required.");
    if (message.length < 2 || message.length > 3000) makeError("Message must be between 2 and 3000 characters.");
    const rows = await query("SELECT issue_id, user_id FROM support_issues WHERE issue_id=? LIMIT 1", [issueId]);
    if (!rows[0]) makeError("Support request not found.", 404);
    if (Number(rows[0].user_id) !== Number(req.user.id)) makeError("You do not have access to this support request.", 403);
    const issue = await withTransaction(async (connection) => {
      const [lockedRows] = await connection.query("SELECT status FROM support_issues WHERE issue_id=? LIMIT 1 FOR UPDATE", [issueId]);
      if (!lockedRows.length || lockedRows[0].status === "closed") makeError("This request is closed. Open a new request if you still need help.", 409);
      if (lockedRows[0].status === "resolved") {
        await connection.query("UPDATE support_issues SET status='open', resolved_at=NULL, updated_at=NOW() WHERE issue_id=?", [issueId]);
        await writeEvent(connection, {
          issueId, actorType: "user", actorId: req.user.id, eventType: "status_changed",
          message: "Customer replied; the request is open again.",
          oldValue: { status: "resolved" }, newValue: { status: "open" },
        });
      } else if (lockedRows[0].status === "awaiting_customer") {
        await connection.query("UPDATE support_issues SET status='assigned', updated_at=NOW() WHERE issue_id=?", [issueId]);
        await writeEvent(connection, {
          issueId, actorType: "user", actorId: req.user.id, eventType: "status_changed",
          message: "Customer replied; the request is back with cafe support.",
          oldValue: { status: "awaiting_customer" }, newValue: { status: "assigned" },
        });
      }
      await connection.query("UPDATE support_issues SET updated_at=NOW() WHERE issue_id=?", [issueId]);
      await writeEvent(connection, { issueId, actorType: "user", actorId: req.user.id, eventType: "comment", message });
      return customerSafeIssue(await getIssue(issueId, connection));
    });
    return res.json({ message: "Reply sent.", issue });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

const adminMiddleware = [
  adminAuth.requireActiveAdmin,
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.SUPPORT_MANAGE),
];

router.get("/admin/assignees", ...adminMiddleware, async (req, res) => {
  try {
    const businessId = await resolveScopedAdminBusinessId(req, { sources: ["query"] });
    const rows = await query(
      `SELECT a.id, a.name, a.role
       FROM admin a
       LEFT JOIN business_admin_memberships m ON m.admin_id=a.id AND m.business_id=?
       WHERE a.status='active' AND (a.role='super_admin' OR m.status='active')
       ORDER BY a.role='super_admin' DESC, a.name ASC, a.id ASC`,
      [businessId]
    );
    return res.json(rows.map((row) => ({ ...row, id: Number(row.id) })));
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get("/admin/issues", ...adminMiddleware, async (req, res) => {
  try {
    const businessId = await resolveScopedAdminBusinessId(req, { sources: ["query"] });
    const status = String(req.query?.status || "open").trim().toLowerCase();
    if (status !== "all" && !ISSUE_STATUSES.has(status)) makeError("Choose a valid support status.");
    const search = String(req.query?.search || "").trim().slice(0, 120);
    const params = [businessId];
    let filters = "WHERE i.business_id=?";
    if (status !== "all") { filters += " AND i.status=?"; params.push(status); }
    if (search) {
      filters += " AND (i.issue_number LIKE ? OR i.subject LIKE ? OR u.name LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const rows = await query(
      `SELECT i.issue_id, i.issue_number, i.business_id, i.booking_id, i.order_id, i.bill_id,
        i.category, i.subject, i.status, i.priority, i.assigned_admin_id, i.created_at, i.updated_at,
        u.name AS customer_name, b.name AS business_name, a.name AS assigned_admin_name
       FROM support_issues i JOIN users u ON u.uid=i.user_id JOIN businesses b ON b.business_id=i.business_id
       LEFT JOIN admin a ON a.id=i.assigned_admin_id ${filters}
       ORDER BY FIELD(i.priority, 'urgent', 'high', 'normal', 'low'), i.updated_at DESC LIMIT 200`,
      params
    );
    return res.json(rows.map((row) => ({ ...row, issue_id: Number(row.issue_id), business_id: Number(row.business_id), assigned_admin_id: row.assigned_admin_id == null ? null : Number(row.assigned_admin_id) })));
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.get("/admin/issues/:id", ...adminMiddleware, async (req, res) => {
  try {
    const issueId = normalizeId(req.params.id);
    if (!issueId) makeError("Valid support request id required.");
    await loadAdminIssue(issueId, req);
    const issue = await getIssue(issueId, null, { includeInternal: true });
    return res.json(issue);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.put("/admin/issues/:id", ...adminMiddleware, async (req, res) => {
  try {
    const issueId = normalizeId(req.params.id);
    if (!issueId) makeError("Valid support request id required.");
    const current = await loadAdminIssue(issueId, req);
    const body = req.body || {};
    const hasStatus = Object.hasOwn(body, "status");
    const hasPriority = Object.hasOwn(body, "priority");
    const hasAssignee = Object.hasOwn(body, "assigned_admin_id");
    const hasResolution = Object.hasOwn(body, "resolution_summary");
    if (!hasStatus && !hasPriority && !hasAssignee && !hasResolution) makeError("Provide at least one issue update.");
    const status = hasStatus ? String(body.status || "").trim().toLowerCase() : null;
    const priority = hasPriority ? String(body.priority || "").trim().toLowerCase() : null;
    if (hasStatus && !ISSUE_STATUSES.has(status)) makeError("Choose a valid support status.");
    if (hasPriority && !ISSUE_PRIORITIES.has(priority)) makeError("Choose a valid priority.");
    const assignedAdminId = hasAssignee ? normalizeId(body.assigned_admin_id) || null : undefined;
    const resolutionSummary = hasResolution ? String(body.resolution_summary || "").trim().slice(0, 1000) || null : undefined;
    if (status === "resolved" && resolutionSummary === null && !hasResolution) {
      const currentIssue = await query("SELECT resolution_summary FROM support_issues WHERE issue_id=? LIMIT 1", [issueId]);
      if (!currentIssue[0]?.resolution_summary) makeError("Add a resolution summary before resolving this request.");
    } else if (status === "resolved" && !resolutionSummary) {
      makeError("Add a resolution summary before resolving this request.");
    }
    if (assignedAdminId) {
      const assignees = await query(
        `SELECT a.id, a.role FROM admin a LEFT JOIN business_admin_memberships m
           ON m.admin_id=a.id AND m.business_id=?
         WHERE a.id=? AND a.status='active' AND (a.role='super_admin' OR m.status='active') LIMIT 1`,
        [Number(current.business_id), assignedAdminId]
      );
      if (!assignees.length) makeError("Assignee must be an active admin assigned to this cafe.", 400);
    }

    const updatedIssue = await withTransaction(async (connection) => {
      const [lockedRows] = await connection.query("SELECT * FROM support_issues WHERE issue_id=? LIMIT 1 FOR UPDATE", [issueId]);
      const before = lockedRows[0];
      if (!before) makeError("Support request not found.", 404);
      const nextStatus = status ?? before.status;
      const nextPriority = priority ?? before.priority;
      const nextAssignee = hasAssignee ? assignedAdminId : (before.assigned_admin_id == null ? null : Number(before.assigned_admin_id));
      const nextResolution = hasResolution ? resolutionSummary : before.resolution_summary;
      await connection.query(
        `UPDATE support_issues SET status=?, priority=?, assigned_admin_id=?, resolution_summary=?,
          resolved_at=CASE WHEN ?='resolved' THEN COALESCE(resolved_at,NOW()) ELSE NULL END,
          closed_at=CASE WHEN ?='closed' THEN COALESCE(closed_at,NOW()) ELSE NULL END,
          updated_at=NOW() WHERE issue_id=?`,
        [nextStatus, nextPriority, nextAssignee, nextResolution, nextStatus, nextStatus, issueId]
      );
      if (nextStatus !== before.status) await writeEvent(connection, {
        issueId, actorType: "admin", actorId: req.admin.id, eventType: "status_changed",
        message: nextStatus === "resolved" ? "Cafe support marked this request as resolved." : `Request status changed to ${nextStatus.replaceAll("_", " ")}.`,
        oldValue: { status: before.status }, newValue: { status: nextStatus },
      });
      if (nextPriority !== before.priority) await writeEvent(connection, {
        issueId, actorType: "admin", actorId: req.admin.id, eventType: "priority_changed",
        message: `Priority set to ${nextPriority}.`, oldValue: { priority: before.priority }, newValue: { priority: nextPriority }, isInternal: true,
      });
      if (nextAssignee !== (before.assigned_admin_id == null ? null : Number(before.assigned_admin_id))) await writeEvent(connection, {
        issueId, actorType: "admin", actorId: req.admin.id, eventType: "assignment_changed",
        message: nextAssignee ? "Request assigned to the cafe support team." : "Request unassigned.",
        oldValue: { assigned_admin_id: before.assigned_admin_id }, newValue: { assigned_admin_id: nextAssignee },
      });
      if (nextResolution && nextResolution !== before.resolution_summary) await writeEvent(connection, {
        issueId, actorType: "admin", actorId: req.admin.id, eventType: "resolution_added",
        message: nextResolution, oldValue: { resolution_summary: before.resolution_summary }, newValue: { resolution_summary: nextResolution },
      });
      return getIssue(issueId, connection, { includeInternal: true });
    });
    return res.json({ message: "Support request updated.", issue: updatedIssue });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

router.post("/admin/issues/:id/comments", ...adminMiddleware, async (req, res) => {
  try {
    const issueId = normalizeId(req.params.id);
    const message = String(req.body?.message || "").trim();
    const isInternal = req.body?.internal === true;
    if (!issueId) makeError("Valid support request id required.");
    if (message.length < 2 || message.length > 3000) makeError("Comment must be between 2 and 3000 characters.");
    await loadAdminIssue(issueId, req);
    const issue = await withTransaction(async (connection) => {
      const [lockedRows] = await connection.query("SELECT status FROM support_issues WHERE issue_id=? LIMIT 1 FOR UPDATE", [issueId]);
      if (!lockedRows.length) makeError("Support request not found.", 404);
      if (lockedRows[0].status === "closed") makeError("This request is closed. Reopen it before adding a reply.", 409);
      await connection.query("UPDATE support_issues SET updated_at=NOW() WHERE issue_id=?", [issueId]);
      await writeEvent(connection, {
        issueId, actorType: "admin", actorId: req.admin.id, eventType: "comment", message, isInternal,
      });
      if (lockedRows[0].status === "awaiting_customer" && !isInternal) {
        await connection.query("UPDATE support_issues SET status='assigned', updated_at=NOW() WHERE issue_id=?", [issueId]);
        await writeEvent(connection, {
          issueId, actorType: "admin", actorId: req.admin.id, eventType: "status_changed",
          message: "Cafe support replied and resumed work on the request.",
          oldValue: { status: "awaiting_customer" }, newValue: { status: "assigned" },
        });
      }
      return getIssue(issueId, connection, { includeInternal: true });
    });
    return res.json({ message: "Comment added.", issue });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ error: error.message });
  }
});

module.exports = router;
