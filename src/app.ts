import express from "express";
import { securityHeaders, corsPolicy, rateLimiter, authRateLimiter } from "./middleware/security";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { authenticate } from "./middleware/authenticate";
import authRouter from "./routes/auth";
import routes from "./routes";

const app = express();

// ── Security ────────────────────────────────────────────
app.use(securityHeaders);
app.use(corsPolicy);
app.use(rateLimiter);

// ── Body parsing ────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));

// ── Health check (unauthenticated) ──────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ── Public routes (no JWT required) ─────────────────────
app.use("/api/v1/auth", authRateLimiter, authRouter);

// ── Protected routes (JWT required) ─────────────────────
app.use("/api/v1", authenticate, routes);

// ── Error handling ──────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
