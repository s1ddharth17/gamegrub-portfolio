const express = require("express");
const router = express.Router();
const db = require("../config/db");
const { withTransaction } = require("../utils/db");
const adminAuth = require("../middleware/adminAuth");
const { ADMIN_PERMISSIONS } = require("../utils/adminAccess");
const { requireAdminBusinessAccess } = require("../utils/businessAccess");
const { normalizeBusinessId } = require("../utils/businesses");
const ALLOWED_PC_CATEGORIES = new Set(["high_end_pc", "esports_pc", "console"]);

function normalizeCategory(value, fallback = "esports_pc") {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    return ALLOWED_PC_CATEGORIES.has(normalized) ? normalized : fallback;
}

//ADD PCS
router.post(
    "/add",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.STATIONS_MANAGE),
    async (req, res) => {
    const { specs, price_per_hour, status } = req.body;
    const category = normalizeCategory(req.body.category);
    const businessId = normalizeBusinessId(req.body.business_id, 0);

    if (!specs || !price_per_hour) {
        return res.status(400).json({ error: "Specs and price per hour are required" });
    }

    try {
        await requireAdminBusinessAccess(req.admin, businessId);
    } catch (error) {
        return res.status(error.statusCode || 500).json({ error: error.message });
    }

    try {
        await withTransaction(async (connection) => {
            const [result] = await connection.query(
                "INSERT INTO pc (business_id, specs, category, price_per_hour, status) VALUES (?, ?, ?, ?, ?)",
                [businessId, specs, category, price_per_hour, status]
            );
            const after = {
                pc_id: Number(result.insertId), business_id: businessId, specs, category,
                price_per_hour, status,
            };
            await connection.query(
                "INSERT INTO business_audit_logs (business_id, actor_admin_id, action, before_json, after_json) VALUES (?, ?, ?, ?, ?)",
                [businessId, req.admin.id, "station.created", null, JSON.stringify(after)]
            );
        });
        res.json({ message: "PC added successfully" });
    } catch (error) {
        res.status(error.statusCode || 500).json({ error: error.message });
    }
});

//GET ALL PCS
router.get("/all", (req, res) => {
    const businessId = normalizeBusinessId(req.query.business_id, 0);
    const sql = businessId
        ? "SELECT pc_id, business_id, specs, category, price_per_hour, status FROM pc WHERE business_id = ? ORDER BY pc_id ASC"
        : "SELECT pc_id, business_id, specs, category, price_per_hour, status FROM pc ORDER BY pc_id ASC";
    const params = businessId ? [businessId] : [];

    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result);
    });
});

//UPDATE PCS
router.put(
    "/update/:id",
    adminAuth.requireActiveAdmin,
    adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.STATIONS_MANAGE),
    async (req, res) => {
    const { specs, price_per_hour, status } = req.body;
    const category = normalizeCategory(req.body.category);
    const businessId = normalizeBusinessId(req.body.business_id, 0);
    const id = req.params.id;

    db.query("SELECT business_id FROM pc WHERE pc_id = ? LIMIT 1", [id], async (selectError, rows) => {
        if (selectError) return res.status(500).json(selectError);
        if (!rows?.length) return res.status(404).json({ error: "Station not found" });

        const currentBusinessId = normalizeBusinessId(rows[0].business_id, 0);
        const targetBusinessId = businessId || currentBusinessId;
        try {
            await requireAdminBusinessAccess(req.admin, currentBusinessId);
            if (targetBusinessId !== currentBusinessId) {
                return res.status(403).json({ error: "Stations cannot be moved between cafes from this editor." });
            }
        } catch (error) {
            return res.status(error.statusCode || 500).json({ error: error.message });
        }

        try {
            await withTransaction(async (connection) => {
                const [currentRows] = await connection.query(
                    "SELECT pc_id, business_id, specs, category, price_per_hour, status FROM pc WHERE pc_id=? AND business_id=? LIMIT 1 FOR UPDATE",
                    [id, currentBusinessId]
                );
                if (!currentRows.length) {
                    const error = new Error("Station not found");
                    error.statusCode = 404;
                    throw error;
                }
                const before = currentRows[0];
                await connection.query(
                    "UPDATE pc SET specs=?, category=?, price_per_hour=?, status=? WHERE pc_id=? AND business_id=?",
                    [specs, category, price_per_hour, status, id, currentBusinessId]
                );
                const after = {
                    pc_id: Number(id), business_id: currentBusinessId, specs, category,
                    price_per_hour, status,
                };
                await connection.query(
                    "INSERT INTO business_audit_logs (business_id, actor_admin_id, action, before_json, after_json) VALUES (?, ?, ?, ?, ?)",
                    [currentBusinessId, req.admin.id, "station.updated", JSON.stringify(before), JSON.stringify(after)]
                );
            });
            res.json({ message: "PC updated" });
        } catch (error) {
            res.status(error.statusCode || 500).json({ error: error.message });
        }
    });
});



//LIVE PC GRID
router.get("/live-status", (req, res) => {
    const businessId = normalizeBusinessId(req.query.business_id, 0);
    const whereClause = businessId ? "WHERE pc.business_id = ?" : "";
    const params = businessId ? [businessId] : [];

    db.query(`
        SELECT
            pc.pc_id,
            pc.business_id,
            pc.specs,
            pc.category,
            pc.price_per_hour,
            pc.status AS pc_status,

            b.booking_id,
            b.status AS booking_status,
            b.start_time,

            u.name AS user_name,

            MIN(bs.hour) AS start_slot,
            MAX(bs.hour) AS end_slot,
            COUNT(bs.hour) AS total_slots

        FROM pc
        ${whereClause}

        LEFT JOIN booking b
            ON pc.pc_id = b.pc_id
            AND b.booking_date = CURDATE()
            AND b.status IN ('confirmed','running','session_over')

        LEFT JOIN booking_slots bs
            ON b.booking_id = bs.booking_id

        LEFT JOIN users u
            ON b.user_id = u.uid

        GROUP BY pc.pc_id
    `, params, (err, rows) => {

        if (err) return res.status(500).json(err);

        const now = new Date();

        const result = rows.map(r => {

            let ui_state = "free";
            let remaining = null;
            let elapsed = null;
            let overtime = null;

            if (r.pc_status === "inactive") {
                ui_state = "inactive";
            }
            else if (r.booking_status === "running" && r.start_time) {

                const totalMinutes = (r.total_slots || 0) * 60;
                const start = new Date(r.start_time);
                const diff = Math.floor((now - start) / 60000);

                elapsed = diff;
                remaining = totalMinutes - diff;

                if (remaining < 0) {
                    overtime = Math.abs(remaining);
                    ui_state = "overtime";
                } else {
                    ui_state = "running";
                }

            }
            else if (r.booking_status === "session_over") {
                ui_state = "awaiting_settlement";
            }
            else if (r.booking_status === "confirmed") {

                const currentHour = now.getHours();

                if (r.start_slot > currentHour)
                    ui_state = "reserved";
                else
                    ui_state = "no_show_risk";
            }

            return {
                pc_id: r.pc_id,
                business_id: r.business_id,
                specs: r.specs,
                category: r.category,
                price_per_hour: r.price_per_hour,
                pc_status: r.pc_status,
                user: r.user_name,
                booking_id: r.booking_id,
                state: ui_state,
                elapsed_minutes: elapsed,
                remaining_minutes: remaining,
                overtime_minutes: overtime
            };

        });

        res.json(result);

    });

});

router.get("/list", (req, res) => {

    const sql = `
        SELECT
            pc_id,
            specs,
            category,
            price_per_hour
        FROM pc
        ORDER BY pc_id
    `;

    db.query(sql, (err, rows) => {
        if (err) return res.status(500).json(err);
        res.json({ data: rows });
    });

});

module.exports = router;`n`n