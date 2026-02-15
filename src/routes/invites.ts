import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { validateBody, param } from "../middleware/validate";
import { createInviteSchema } from "../schemas/invite";

// ── Company-scoped router (mounted inside companyGuard) ──────────
export const companyInvitesRouter = Router({ mergeParams: true });

const INVITE_EXPIRY_DAYS = 7;

/** POST /companies/:companyId/invites — Invite a member */
companyInvitesRouter.post(
  "/",
  validateBody(createInviteSchema),
  async (req, res) => {
    const employeeRole = req.employee?.role;

    // Only owners and managers can invite
    if (employeeRole !== "owner" && employeeRole !== "manager") {
      res
        .status(403)
        .json({ error: "Only owners and managers can send invites." });
      return;
    }

    const { email, role, firstName, lastName } = req.body;
    const companyId = param(req, "companyId");

    // Managers cannot invite owners (privilege escalation guard)
    if (employeeRole === "manager" && role === "owner") {
      res
        .status(403)
        .json({ error: "Managers cannot invite owners." });
      return;
    }

    // Check if the email is already an active employee of this company
    const existingEmployee = await prisma.employee.findFirst({
      where: {
        company: { id: companyId },
        user: { email },
        isActive: true,
      },
      select: { id: true },
    });

    if (existingEmployee) {
      res
        .status(409)
        .json({ error: "This email is already an active member of the company." });
      return;
    }

    // Check for an existing pending invite for the same email + company
    const existingInvite = await prisma.invite.findFirst({
      where: {
        companyId,
        email,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });

    if (existingInvite) {
      res
        .status(409)
        .json({ error: "A pending invite already exists for this email." });
      return;
    }

    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

    const invite = await prisma.invite.create({
      data: {
        companyId,
        email,
        role,
        firstName,
        lastName,
        token,
        expiresAt,
      },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        token: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    res.status(201).json(invite);
  }
);

// ── Invite acceptance router (no company guard) ──────────────────
export const inviteAcceptRouter = Router();

/** POST /invites/:token/accept — Accept an invite */
inviteAcceptRouter.post("/:token/accept", async (req, res) => {
  const token = param(req, "token");
  const userId = req.user?.userId;
  const userEmail = req.user?.email;

  if (!userId || !userEmail) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }

  const invite = await prisma.invite.findUnique({
    where: { token },
    select: {
      id: true,
      companyId: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      expiresAt: true,
      acceptedAt: true,
      company: { select: { id: true, companyName: true } },
    },
  });

  if (!invite) {
    res.status(404).json({ error: "Invite not found." });
    return;
  }

  if (invite.acceptedAt) {
    res.status(400).json({ error: "This invite has already been accepted." });
    return;
  }

  if (invite.expiresAt < new Date()) {
    res.status(400).json({ error: "This invite has expired." });
    return;
  }

  if (invite.email !== userEmail) {
    res
      .status(403)
      .json({ error: "This invite was sent to a different email address." });
    return;
  }

  // Check if user is already an active employee
  const existingEmployee = await prisma.employee.findFirst({
    where: {
      userId,
      companyId: invite.companyId,
      isActive: true,
    },
    select: { id: true },
  });

  if (existingEmployee) {
    res
      .status(409)
      .json({ error: "You are already a member of this company." });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const employee = await tx.employee.create({
      data: {
        userId,
        companyId: invite.companyId,
        firstName: invite.firstName,
        lastName: invite.lastName,
        role: invite.role,
      },
    });

    await tx.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    return employee;
  });

  res.status(201).json({
    employee: {
      id: result.id,
      firstName: result.firstName,
      lastName: result.lastName,
      role: result.role,
      companyId: result.companyId,
    },
    company: invite.company,
  });
});
