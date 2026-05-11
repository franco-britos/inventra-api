import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcrypt";
import * as OTPAuth from "otpauth";
import { prisma } from "../lib/prisma";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  signMfaToken,
  signReauthToken,
  verifyMfaToken,
} from "../lib/jwt";
import { sendPasswordResetEmail, sendMfaEmailCode } from "../lib/email";
import { validateBody } from "../middleware/validate";
import { authenticate } from "../middleware/authenticate";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  reauthSchema,
} from "../schemas/auth";
import { mfaVerifySchema, mfaSendEmailCodeSchema } from "../schemas/mfa";

const router = Router();
const BCRYPT_ROUNDS = 12;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

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
      mfaTotpEnabled: true,
      mfaEmailEnabled: true,
    },
  });

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

  await prisma.appUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  if (user.mfaTotpEnabled || user.mfaEmailEnabled) {
    const methods: ("totp" | "email")[] = [];
    if (user.mfaTotpEnabled) methods.push("totp");
    if (user.mfaEmailEnabled) methods.push("email");

    const mfaToken = signMfaToken({ userId: user.id, email: user.email });
    res.json({ mfaRequired: true, mfaToken, methods });
    return;
  }

  const activeEmployee = await prisma.employee.findFirst({
    where: { userId: user.id, isActive: true },
    select: { companyId: true, role: true },
    orderBy: { createdAt: "asc" },
  });

  const accessToken = signAccessToken({ userId: user.id, email: user.email });
  const refreshToken = signRefreshToken({ userId: user.id });

  res.json({
    user: { id: user.id, email: user.email },
    accessToken,
    refreshToken,
    employee: activeEmployee,
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

/** POST /auth/reauth — Verify password and issue short-lived re-auth token */
router.post(
  "/reauth",
  authenticate,
  validateBody(reauthSchema),
  async (req, res) => {
    const { password } = req.body;
    const userId = req.user!.userId;

    const user = await prisma.appUser.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, isActive: true },
    });

    if (!user || !user.passwordHash || !user.isActive) {
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials." });
      return;
    }

    const reauthToken = signReauthToken({ userId: user.id });
    res.json({ reauthToken });
  }
);

/** POST /auth/forgot-password — Request a password reset email */
router.post(
  "/forgot-password",
  validateBody(forgotPasswordSchema),
  async (req, res) => {
    const { email } = req.body;

    const GENERIC_MESSAGE =
      "If an account with that email exists, a reset link has been sent.";

    try {
      const user = await prisma.appUser.findUnique({
        where: { email },
        select: { id: true, email: true, isActive: true },
      });

      if (!user || !user.isActive) {
        res.json({ message: GENERIC_MESSAGE });
        return;
      }

      const rawToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = hashToken(rawToken);

      await prisma.appUser.update({
        where: { id: user.id },
        data: {
          passwordResetToken: hashedToken,
          passwordResetExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      });

      try {
        await sendPasswordResetEmail(user.email, rawToken);
      } catch {
        // Email failure should not reveal account existence
      }

      res.json({ message: GENERIC_MESSAGE });
    } catch (err) {
      // DB or other failures: same response so we do not leak infrastructure state
      console.error("[auth/forgot-password]", err);
      res.json({ message: GENERIC_MESSAGE });
    }
  }
);

/** POST /auth/reset-password — Set a new password using a reset token */
router.post(
  "/reset-password",
  validateBody(resetPasswordSchema),
  async (req, res) => {
    const { token, password } = req.body;

    const hashedToken = hashToken(token);

    const user = await prisma.appUser.findFirst({
      where: {
        passwordResetToken: hashedToken,
        passwordResetExpiresAt: { gt: new Date() },
      },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      res.status(400).json({ error: "Invalid or expired reset token." });
      return;
    }

    if (user.passwordHash) {
      const isSame = await bcrypt.compare(password, user.passwordHash);
      if (isSame) {
        res.status(400).json({
          error: "New password must be different from your current password.",
        });
        return;
      }
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await prisma.appUser.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
      },
    });

    res.json({ message: "Password has been reset successfully." });
  }
);

// ── MFA Public Routes ───────────────────────────────────────────

async function issueFullAuthResponse(userId: string, email: string) {
  const activeEmployee = await prisma.employee.findFirst({
    where: { userId, isActive: true },
    select: { companyId: true, role: true },
    orderBy: { createdAt: "asc" },
  });

  const accessToken = signAccessToken({ userId, email });
  const refreshToken = signRefreshToken({ userId });

  return {
    user: { id: userId, email },
    accessToken,
    refreshToken,
    employee: activeEmployee,
  };
}

/** POST /auth/mfa/verify — Verify MFA code and issue tokens */
router.post(
  "/mfa/verify",
  validateBody(mfaVerifySchema),
  async (req, res) => {
    const { mfaToken, code, method } = req.body;

    let payload;
    try {
      payload = verifyMfaToken(mfaToken);
    } catch {
      res.status(401).json({ error: "Invalid or expired MFA token." });
      return;
    }

    const user = await prisma.appUser.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        isActive: true,
        mfaTotpEnabled: true,
        mfaTotpSecret: true,
        mfaEmailEnabled: true,
        mfaEmailCode: true,
        mfaEmailCodeExpiresAt: true,
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: "Invalid or expired MFA token." });
      return;
    }

    if (method === "totp") {
      if (!user.mfaTotpEnabled || !user.mfaTotpSecret) {
        res.status(400).json({ error: "TOTP is not enabled for this account." });
        return;
      }

      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(user.mfaTotpSecret),
        algorithm: "SHA1",
        digits: 6,
        period: 30,
      });

      const delta = totp.validate({ token: code, window: 1 });
      if (delta === null) {
        res.status(401).json({ error: "Invalid verification code." });
        return;
      }
    } else if (method === "email") {
      if (!user.mfaEmailEnabled) {
        res.status(400).json({ error: "Email MFA is not enabled for this account." });
        return;
      }

      if (
        !user.mfaEmailCode ||
        !user.mfaEmailCodeExpiresAt ||
        user.mfaEmailCodeExpiresAt < new Date()
      ) {
        res.status(401).json({ error: "Invalid or expired verification code." });
        return;
      }

      const hashedCode = hashToken(code);
      if (hashedCode !== user.mfaEmailCode) {
        res.status(401).json({ error: "Invalid verification code." });
        return;
      }

      await prisma.appUser.update({
        where: { id: user.id },
        data: { mfaEmailCode: null, mfaEmailCodeExpiresAt: null },
      });
    }

    const authResponse = await issueFullAuthResponse(user.id, user.email);
    res.json(authResponse);
  }
);

/** POST /auth/mfa/send-email-code — Send an email MFA code */
router.post(
  "/mfa/send-email-code",
  validateBody(mfaSendEmailCodeSchema),
  async (req, res) => {
    const { mfaToken } = req.body;

    let payload;
    try {
      payload = verifyMfaToken(mfaToken);
    } catch {
      res.status(401).json({ error: "Invalid or expired MFA token." });
      return;
    }

    const user = await prisma.appUser.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, mfaEmailEnabled: true },
    });

    if (!user || !user.mfaEmailEnabled) {
      res.json({ message: "If email MFA is enabled, a code has been sent." });
      return;
    }

    const rawCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = hashToken(rawCode);

    await prisma.appUser.update({
      where: { id: user.id },
      data: {
        mfaEmailCode: hashedCode,
        mfaEmailCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    try {
      await sendMfaEmailCode(user.email, rawCode);
    } catch {
      // Swallow email failures to avoid leaking info
    }

    res.json({ message: "If email MFA is enabled, a code has been sent." });
  }
);

export default router;
