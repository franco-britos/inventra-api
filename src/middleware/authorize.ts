import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { param } from "./validate";

/**
 * Middleware that verifies the authenticated user is an active employee
 * of the company specified by :companyId in the route.
 *
 * Must run AFTER `authenticate` (so `req.user` is set)
 * and AFTER `validateUUIDParams("companyId")`.
 *
 * Rejects with 403 if the user has no active membership in the company.
 */
export async function authorizeCompanyAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }

  const companyId = param(req, "companyId");

  const membership = await prisma.employee.findFirst({
    where: {
      userId,
      companyId,
      isActive: true,
    },
    select: { id: true, role: true },
  });

  if (!membership) {
    res.status(403).json({ error: "You do not have access to this company." });
    return;
  }

  // Attach employee context for downstream handlers
  req.employee = { id: membership.id, role: membership.role };

  next();
}
