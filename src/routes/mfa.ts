import { Router, Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import * as OTPAuth from "otpauth";
import { prisma } from "../lib/prisma";
import { verifyReauthToken } from "../lib/jwt";
import { sendMfaEmailCode } from "../lib/email";
import { validateBody } from "../middleware/validate";
import { mfaCodeSchema } from "../schemas/mfa";

const router = Router();

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function requireRecentReauth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = req.headers["x-reauth-token"];
  if (typeof token !== "string" || token.length === 0) {
    res.status(401).json({ error: "Recent re-authentication is required." });
    return;
  }

  try {
    const payload = verifyReauthToken(token);
    if (payload.userId !== req.user!.userId) {
      res.status(401).json({ error: "Invalid re-authentication token." });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired re-authentication token." });
  }
}

/** GET /mfa/status — Current MFA status for the authenticated user */
router.get("/status", async (req, res) => {
  const user = await prisma.appUser.findUnique({
    where: { id: req.user!.userId },
    select: { mfaTotpEnabled: true, mfaEmailEnabled: true },
  });

  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  res.json({
    totpEnabled: user.mfaTotpEnabled,
    emailEnabled: user.mfaEmailEnabled,
  });
});

// ── TOTP ─────────────────────────────────────────────────────────

/** POST /mfa/totp/setup — Generate a TOTP secret and return the otpauth URI */
router.post("/totp/setup", requireRecentReauth, async (req, res) => {
  const secret = new OTPAuth.Secret({ size: 20 });

  const totp = new OTPAuth.TOTP({
    issuer: "Inventra",
    label: req.user!.email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });

  await prisma.appUser.update({
    where: { id: req.user!.userId },
    data: { mfaTotpSecret: secret.base32, mfaTotpEnabled: false },
  });

  res.json({ uri: totp.toString() });
});

/** POST /mfa/totp/confirm — Verify a code from the authenticator app to enable TOTP */
router.post(
  "/totp/confirm",
  requireRecentReauth,
  validateBody(mfaCodeSchema),
  async (req, res) => {
    const { code } = req.body;

    const user = await prisma.appUser.findUnique({
      where: { id: req.user!.userId },
      select: { mfaTotpSecret: true },
    });

    if (!user?.mfaTotpSecret) {
      res.status(400).json({ error: "Run TOTP setup first." });
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
      res.status(400).json({ error: "Invalid code. Please try again." });
      return;
    }

    await prisma.appUser.update({
      where: { id: req.user!.userId },
      data: { mfaTotpEnabled: true },
    });

    res.json({ message: "TOTP has been enabled." });
  }
);

/** DELETE /mfa/totp — Disable TOTP */
router.delete("/totp", requireRecentReauth, async (req, res) => {
  await prisma.appUser.update({
    where: { id: req.user!.userId },
    data: { mfaTotpEnabled: false, mfaTotpSecret: null },
  });

  res.json({ message: "TOTP has been disabled." });
});

// ── Email MFA ────────────────────────────────────────────────────

/** POST /mfa/email/enable — Send a verification code to enable email MFA */
router.post("/email/enable", requireRecentReauth, async (req, res) => {
  const user = await prisma.appUser.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, email: true },
  });

  if (!user) {
    res.status(404).json({ error: "User not found." });
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
    // Swallow to avoid leaking email delivery details
  }

  res.json({ message: "Verification code sent to your email." });
});

/** POST /mfa/email/confirm — Verify the emailed code to enable email MFA */
router.post(
  "/email/confirm",
  requireRecentReauth,
  validateBody(mfaCodeSchema),
  async (req, res) => {
    const { code } = req.body;

    const user = await prisma.appUser.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        mfaEmailCode: true,
        mfaEmailCodeExpiresAt: true,
      },
    });

    if (
      !user?.mfaEmailCode ||
      !user.mfaEmailCodeExpiresAt ||
      user.mfaEmailCodeExpiresAt < new Date()
    ) {
      res.status(400).json({ error: "Invalid or expired code." });
      return;
    }

    const hashedCode = hashToken(code);
    if (hashedCode !== user.mfaEmailCode) {
      res.status(400).json({ error: "Invalid code. Please try again." });
      return;
    }

    await prisma.appUser.update({
      where: { id: user.id },
      data: {
        mfaEmailEnabled: true,
        mfaEmailCode: null,
        mfaEmailCodeExpiresAt: null,
      },
    });

    res.json({ message: "Email MFA has been enabled." });
  }
);

/** DELETE /mfa/email — Disable email MFA */
router.delete("/email", requireRecentReauth, async (req, res) => {
  await prisma.appUser.update({
    where: { id: req.user!.userId },
    data: { mfaEmailEnabled: false, mfaEmailCode: null, mfaEmailCodeExpiresAt: null },
  });

  res.json({ message: "Email MFA has been disabled." });
});

export default router;
