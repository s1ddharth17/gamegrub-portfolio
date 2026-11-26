const express = require("express");

const adminAuth = require("../middleware/adminAuth");
const { ADMIN_PERMISSIONS } = require("../utils/adminAccess");
const { query, withTransaction } = require("../utils/db");
const {
  IMAGE_UPLOAD_MIME_TYPES,
  createUploadMiddleware,
  deleteStoredFile,
  persistUploadedFile,
} = require("../utils/uploadStorage");
const { requireAdminBusinessAccess } = require("../utils/businessAccess");
const { normalizeBusinessId } = require("../utils/businesses");

const router = express.Router();
const upload = createUploadMiddleware({
  maxFileSizeBytes: 5 * 1024 * 1024,
  allowedMimeTypes: IMAGE_UPLOAD_MIME_TYPES,
});

function toFlag(value, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (value === true || value === "true" || value === "1" || value === 1) {
    return 1;
  }

  return 0;
}

// ADD MENU ITEM
router.post(
  "/add",
  adminAuth.requireActiveAdmin,
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.MENU_MANAGE),
  upload.single("image"),
  async (req, res) => {
  const {
    name,
    amount,
    business_id: rawBusinessId,
    category = "Snacks",
    description = "",
    prep_time_minutes: prepTimeMinutes = 10,
    is_available: isAvailable = 1,
    is_featured: isFeatured = 0,
  } = req.body;
  const businessId = normalizeBusinessId(rawBusinessId, 0);

  if (!name || !amount) {
    return res.status(400).json({ error: "Name and amount are required" });
  }

  let storedImage = null;

  try {
    await requireAdminBusinessAccess(req.admin, businessId);
    storedImage = await persistUploadedFile(req.file, {
      folder: "menu",
      allowedMimeTypes: IMAGE_UPLOAD_MIME_TYPES,
    });

    await withTransaction(async (connection) => {
      const [result] = await connection.query(
        `
          INSERT INTO menu (
            business_id, name, amount, image, category, description,
            prep_time_minutes, is_available, is_featured
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [businessId, name, amount, storedImage, category, description,
          Number(prepTimeMinutes) || 10, toFlag(isAvailable, 1), toFlag(isFeatured, 0)]
      );
      const after = {
        id: Number(result.insertId), business_id: businessId, name, amount,
        image: storedImage, category, description,
        prep_time_minutes: Number(prepTimeMinutes) || 10,
        is_available: toFlag(isAvailable, 1), is_featured: toFlag(isFeatured, 0),
      };
      await connection.query(
        "INSERT INTO business_audit_logs (business_id, actor_admin_id, action, before_json, after_json) VALUES (?, ?, ?, ?, ?)",
        [businessId, req.admin.id, "menu_item.created", null, JSON.stringify(after)]
      );
    });

    res.json({ message: "Menu item added" });
  } catch (error) {
    if (storedImage) {
      try {
        await deleteStoredFile(storedImage);
      } catch (cleanupError) {
        console.warn("Failed to clean up menu image after insert error:", cleanupError);
      }
    }

    res.status(error.statusCode || 500).json({ error: error.message });
  }
  }
);

// GET MENU
router.get("/all", async (req, res) => {
  try {
    const businessId = normalizeBusinessId(req.query?.business_id, 0);
    const rows = await query(
      `
        SELECT
          id,
          business_id,
          name,
          amount,
          image,
          category,
          description,
          prep_time_minutes,
          is_available,
          is_featured
        FROM menu
        ${businessId ? "WHERE business_id = ?" : ""}
        ORDER BY is_featured DESC, category ASC, name ASC
      `,
      businessId ? [businessId] : []
    );

    res.json(
      rows.map((row) => ({
        ...row,
        amount: Number(row.amount || 0),
        prep_time_minutes: Number(row.prep_time_minutes || 0),
        is_available: Boolean(row.is_available),
        is_featured: Boolean(row.is_featured),
      }))
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE MENU ITEM
router.put(
  "/update/:id",
  adminAuth.requireActiveAdmin,
  adminAuth.requireAdminPermission(ADMIN_PERMISSIONS.MENU_MANAGE),
  upload.single("image"),
  async (req, res) => {
  const {
    name,
    amount,
    business_id: rawBusinessId,
    category = "Snacks",
    description = "",
    prep_time_minutes: prepTimeMinutes = 10,
    is_available: isAvailable = 1,
    is_featured: isFeatured = 0,
  } = req.body;
  const businessId = normalizeBusinessId(rawBusinessId, 0);
  const menuId = req.params.id;
  let storedImage = null;
  let previousImage = null;

  try {
    const rows = await query(
      `
        SELECT id, business_id, name, amount, image, category, description,
          prep_time_minutes, is_available, is_featured
        FROM menu
        WHERE id = ?
        LIMIT 1
      `,
      [menuId]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: "Menu item not found" });
    }

    const currentBusinessId = normalizeBusinessId(rows[0].business_id, 0);
    const targetBusinessId = businessId || currentBusinessId;
    await requireAdminBusinessAccess(req.admin, currentBusinessId);
    if (targetBusinessId !== currentBusinessId) {
      return res.status(403).json({ error: "Menu items cannot be moved between cafes from this editor." });
    }

    previousImage = rows[0].image || null;

    if (req.file) {
      storedImage = await persistUploadedFile(req.file, {
        folder: "menu",
        allowedMimeTypes: IMAGE_UPLOAD_MIME_TYPES,
      });
    }

    const after = {
      id: Number(menuId), business_id: currentBusinessId, name, amount,
      image: storedImage || previousImage, category, description,
      prep_time_minutes: Number(prepTimeMinutes) || 10,
      is_available: toFlag(isAvailable, 1), is_featured: toFlag(isFeatured, 0),
    };
    const imageIsBeingUpdated = Boolean(req.file);
    await withTransaction(async (connection) => {
      const [currentRows] = await connection.query(
        `SELECT id, business_id, name, amount, image, category, description,
          prep_time_minutes, is_available, is_featured
         FROM menu WHERE id=? AND business_id=? LIMIT 1 FOR UPDATE`,
        [menuId, currentBusinessId]
      );
      if (!currentRows.length) {
        const error = new Error("Menu item not found");
        error.statusCode = 404;
        throw error;
      }
      const before = currentRows[0];
      await connection.query(
        `UPDATE menu SET name=?, amount=?, ${imageIsBeingUpdated ? "image=?, " : ""}
          category=?, description=?, prep_time_minutes=?, is_available=?, is_featured=?
         WHERE id=? AND business_id=?`,
        [name, amount, ...(imageIsBeingUpdated ? [storedImage] : []), category, description,
          Number(prepTimeMinutes) || 10, toFlag(isAvailable, 1), toFlag(isFeatured, 0),
          menuId, currentBusinessId]
      );
      await connection.query(
        "INSERT INTO business_audit_logs (business_id, actor_admin_id, action, before_json, after_json) VALUES (?, ?, ?, ?, ?)",
        [currentBusinessId, req.admin.id, "menu_item.updated", JSON.stringify(before), JSON.stringify(after)]
      );
    });

    if (storedImage && previousImage && previousImage !== storedImage) {
      try {
        await deleteStoredFile(previousImage);
      } catch (cleanupError) {
        console.warn("Failed to clean up previous menu image:", cleanupError);
      }
    }

    res.json({ message: "Menu item updated" });
  } catch (error) {
    if (storedImage && storedImage !== previousImage) {
      try {
        await deleteStoredFile(storedImage);
      } catch (cleanupError) {
        console.warn("Failed to clean up menu image after update error:", cleanupError);
      }
    }

    res.status(error.statusCode || 500).json({ error: error.message });
  }
  }
);

module.exports = router;
