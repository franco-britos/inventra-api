import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, AccessTokenPayload } from "../lib/jwt";

/**
 * Extend Express Request to carry the authenticated user.
 * Available on any handler after the authenticate middleware.
 */
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
      employee?: { id: string; role: string };
      validatedQuery?: Record<string, unknown>;
    }
  }
}

/**
 * Middleware that verifies the JWT access token from the Authorization header.
 * Rejects with 401 if the token is missing, malformed, or expired.
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed Authorization header." });
    return;
  }

  const token = header.slice(7); // strip "Bearer "

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token." });
  }
}
