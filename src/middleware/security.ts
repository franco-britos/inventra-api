import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { env } from "../config/env";

/** Standard security headers via Helmet */
export const securityHeaders = helmet();

/** CORS — restrict origins in production */
export const corsPolicy = cors({
  origin: env.CORS_ORIGIN,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Reauth-Token"],
  maxAge: 86400, // 24 h preflight cache
});

const skipRateLimit = env.NODE_ENV === "test" || env.NODE_ENV === "development";

/** Global rate limiter — 100 requests per 15 min window per IP */
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  skip: () => skipRateLimit,
});

/** Stricter rate limiter for auth endpoints — 10 requests per 15 min per IP */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many auth attempts, please try again later." },
  skip: () => skipRateLimit,
});
