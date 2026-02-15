import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

/**
 * Global error handler. Catches anything that slips through route handlers.
 * In production, never expose stack traces or internal details.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error("[ERROR]", err);

  const status = (err as any).status ?? 500;
  const message =
    env.NODE_ENV === "production" ? "Internal server error" : err.message;

  res.status(status).json({ error: message });
}

/** Catch-all for routes that don't match */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found" });
}
