import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

/**
 * Global error handler. Catches anything that slips through route handlers.
 * Never send raw `err.message` to clients — it often contains DB/Prisma details.
 * Full details stay in server logs (and stack traces in non-production).
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error("[ERROR]", err);
  if (env.NODE_ENV !== "production" && err.stack) {
    console.error(err.stack);
  }

  const rawStatus = (err as { status?: unknown }).status;
  const status =
    typeof rawStatus === "number" &&
    rawStatus >= 400 &&
    rawStatus < 600
      ? rawStatus
      : 500;

  const message =
    status >= 500
      ? "Something went wrong. Please try again later."
      : "Unable to complete this request.";

  res.status(status).json({ error: message });
}

/** Catch-all for routes that don't match */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found" });
}
