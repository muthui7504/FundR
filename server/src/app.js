import "dotenv/config";
import express from "express";
import authRoutes from "./routes/auth.routes.js";
import paymentRoutes from "./routes/payments.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";

export const app = express();

app.use(express.json({ limit: "1mb" }));
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/payments", paymentRoutes);
app.use(notFound);
app.use(errorHandler);
