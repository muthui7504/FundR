import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Router } from "express";
import { pool } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.created_at };
}

function issueToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1d" });
}

router.post("/register", asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (typeof name !== "string" || name.trim().length < 2 ||
      typeof email !== "string" || !email.includes("@") ||
      typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ message: "Name, valid email, and a password of at least 8 characters are required." });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const [result] = await pool.execute(
      "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
      [name.trim(), email.trim().toLowerCase(), passwordHash],
    );
    const [rows] = await pool.execute("SELECT * FROM users WHERE id = ?", [result.insertId]);
    const user = rows[0];
    return res.status(201).json({ user: publicUser(user), token: issueToken(user) });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Email is already registered." });
    throw error;
  }
}));

router.post("/login", asyncHandler(async (req, res) => {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const [rows] = await pool.execute("SELECT * FROM users WHERE email = ?", [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ message: "Invalid email or password." });
  }
  return res.json({ user: publicUser(user), token: issueToken(user) });
}));

router.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const [rows] = await pool.execute("SELECT * FROM users WHERE id = ?", [req.user.id]);
  if (!rows[0]) return res.status(401).json({ message: "User no longer exists." });
  return res.json({ user: publicUser(rows[0]) });
}));

export default router;
