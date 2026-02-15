import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../lib/prisma";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/jwt";
import { validateBody } from "../middleware/validate";
import { registerSchema, loginSchema, refreshSchema } from "../schemas/auth";

const router = Router();
const BCRYPT_ROUNDS = 12;

/** POST /auth/register — Create a new user account */
router.post("/register", validateBody(registerSchema), async (req, res) => {
  const { email, password } = req.body;

  // Check for existing account — intentionally reveals existence for UX.
  // Acceptable for a business tool; login/reset flows would expose this anyway.
  const existing = await prisma.appUser.findUnique({ where: { email } });
  if (existing) {
    res
      .status(409)
      .json({ error: "An account with this email already exists." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const user = await prisma.appUser.create({
    data: {
      email,
      passwordHash,
    },
    select: {
      id: true,
      email: true,
      createdAt: true,
    },
  });

  const accessToken = signAccessToken({ userId: user.id, email: user.email });
  const refreshToken = signRefreshToken({ userId: user.id });

  res.status(201).json({
    user,
    accessToken,
    refreshToken,
  });
});

/** POST /auth/login — Authenticate and receive tokens */
router.post("/login", validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.appUser.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      isActive: true,
    },
  });

  // Generic error to avoid leaking which field is wrong
  const INVALID_CREDENTIALS = "Invalid email or password.";

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: INVALID_CREDENTIALS });
    return;
  }
  if (!user.isActive) {
    res.status(403).json({ error: "Account is deactivated." });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: INVALID_CREDENTIALS });
    return;
  }

  // Update last login timestamp
  await prisma.appUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const accessToken = signAccessToken({ userId: user.id, email: user.email });
  const refreshToken = signRefreshToken({ userId: user.id });

  res.json({
    user: { id: user.id, email: user.email },
    accessToken,
    refreshToken,
  });
});

/** POST /auth/refresh — Exchange a refresh token for a new access token */
router.post("/refresh", validateBody(refreshSchema), async (req, res) => {
  const { refreshToken } = req.body;

  try {
    const payload = verifyRefreshToken(refreshToken);

    // Ensure the user still exists and is active
    const user = await prisma.appUser.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, isActive: true },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: "User not found or deactivated." });
      return;
    }

    const newAccessToken = signAccessToken({
      userId: user.id,
      email: user.email,
    });

    res.json({ accessToken: newAccessToken });
  } catch {
    res.status(401).json({ error: "Invalid or expired refresh token." });
  }
});

export default router;
