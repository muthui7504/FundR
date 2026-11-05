import { Router } from "express";
import { pool } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
const STATUSES = new Set(["PENDING", "COMPLETED", "FAILED", "REFUNDED"]);

router.use(requireAuth);

router.post("/", asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  const currency = typeof req.body.currency === "string" ? req.body.currency.toUpperCase() : "KES";
  const description = typeof req.body.description === "string" ? req.body.description.trim() : null;
  if (!Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) {
    return res.status(400).json({ message: "A positive amount and a valid three-letter currency are required." });
  }
  const [result] = await pool.execute(
    "INSERT INTO payments (user_id, amount, currency, description) VALUES (?, ?, ?, ?)",
    [req.user.id, amount, currency, description],
  );
  const [rows] = await pool.execute("SELECT * FROM payments WHERE id = ? AND user_id = ?", [result.insertId, req.user.id]);
  return res.status(201).json(rows[0]);
}));

router.get("/", asyncHandler(async (req, res) => {
  const [rows] = await pool.execute("SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC", [req.user.id]);
  return res.json(rows);
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const [rows] = await pool.execute("SELECT * FROM payments WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
  if (!rows[0]) return res.status(404).json({ message: "Payment not found." });
  return res.json(rows[0]);
}));

router.patch("/:id", asyncHandler(async (req, res) => {
  const fields = [];
  const values = [];
  if (req.body.status !== undefined) {
    if (!STATUSES.has(req.body.status)) return res.status(400).json({ message: "Invalid payment status." });
    fields.push("status = ?");
    values.push(req.body.status);
  }
  if (req.body.description !== undefined) {
    fields.push("description = ?");
    values.push(typeof req.body.description === "string" ? req.body.description.trim() : null);
  }
  if (!fields.length) return res.status(400).json({ message: "No supported fields to update." });
  values.push(req.params.id, req.user.id);
  const [result] = await pool.execute(`UPDATE payments SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`, values);
  if (!result.affectedRows) return res.status(404).json({ message: "Payment not found." });
  const [rows] = await pool.execute("SELECT * FROM payments WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
  return res.json(rows[0]);
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const [result] = await pool.execute("DELETE FROM payments WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
  if (!result.affectedRows) return res.status(404).json({ message: "Payment not found." });
  return res.status(204).send();
}));

export default router;
