import crypto from "node:crypto";
import * as OTPAuth from "otpauth";
import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { useCleanDatabase, testPrisma } from "../helpers/setup";
import { registerUser } from "../helpers/auth";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function getReauthToken(accessToken: string, password: string): Promise<string> {
  const res = await request(app)
    .post("/api/v1/auth/reauth")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ password })
    .expect(200);

  return res.body.reauthToken;
}

describe("MFA endpoints", () => {
  useCleanDatabase();

  // ── TOTP setup + confirm + login flow ──────────────────────────

  describe("TOTP setup and login flow", () => {
    it("sets up TOTP, confirms with a valid code, and requires MFA on login", async () => {
      const user = await registerUser({
        email: "totp@test.com",
        password: "Test@pass1",
      });

      // 1. Setup TOTP — returns otpauth URI
      const reauthToken = await getReauthToken(user.accessToken, "Test@pass1");
      const setupRes = await request(app)
        .post("/api/v1/mfa/totp/setup")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .set("X-Reauth-Token", reauthToken)
        .expect(200);

      expect(setupRes.body.uri).toMatch(/^otpauth:\/\/totp\//);

      // Extract the secret from the URI
      const uri = new URL(setupRes.body.uri);
      const secret = uri.searchParams.get("secret")!;

      // 2. Generate a valid TOTP code
      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(secret),
        algorithm: "SHA1",
        digits: 6,
        period: 30,
      });
      const code = totp.generate();

      // 3. Confirm TOTP
      await request(app)
        .post("/api/v1/mfa/totp/confirm")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .set("X-Reauth-Token", reauthToken)
        .send({ code })
        .expect(200);

      // 4. Login should now return MFA challenge
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "totp@test.com", password: "Test@pass1" })
        .expect(200);

      expect(loginRes.body.mfaRequired).toBe(true);
      expect(loginRes.body.mfaToken).toBeDefined();
      expect(loginRes.body.methods).toContain("totp");
      expect(loginRes.body.accessToken).toBeUndefined();

      // 5. Verify MFA with TOTP code
      const mfaCode = totp.generate();
      const verifyRes = await request(app)
        .post("/api/v1/auth/mfa/verify")
        .send({
          mfaToken: loginRes.body.mfaToken,
          code: mfaCode,
          method: "totp",
        })
        .expect(200);

      expect(verifyRes.body.accessToken).toBeDefined();
      expect(verifyRes.body.refreshToken).toBeDefined();
      expect(verifyRes.body.user.email).toBe("totp@test.com");
    });

    it("rejects an invalid TOTP code during verify", async () => {
      const user = await registerUser({
        email: "badtotp@test.com",
        password: "Test@pass1",
      });

      // Setup + confirm TOTP
      const reauthToken = await getReauthToken(user.accessToken, "Test@pass1");
      const setupRes = await request(app)
        .post("/api/v1/mfa/totp/setup")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .set("X-Reauth-Token", reauthToken)
        .expect(200);

      const uri = new URL(setupRes.body.uri);
      const secret = uri.searchParams.get("secret")!;
      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(secret),
        algorithm: "SHA1",
        digits: 6,
        period: 30,
      });

      await request(app)
        .post("/api/v1/mfa/totp/confirm")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .set("X-Reauth-Token", reauthToken)
        .send({ code: totp.generate() })
        .expect(200);

      // Login to get MFA token
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "badtotp@test.com", password: "Test@pass1" })
        .expect(200);

      // Try with a wrong code
      await request(app)
        .post("/api/v1/auth/mfa/verify")
        .send({
          mfaToken: loginRes.body.mfaToken,
          code: "000000",
          method: "totp",
        })
        .expect(401);
    });

    it("can disable TOTP and login without MFA", async () => {
      const user = await registerUser({
        email: "disabletotp@test.com",
        password: "Test@pass1",
      });

      // Setup + confirm TOTP
      const reauthToken = await getReauthToken(user.accessToken, "Test@pass1");
      const setupRes = await request(app)
        .post("/api/v1/mfa/totp/setup")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .set("X-Reauth-Token", reauthToken)
        .expect(200);

      const uri = new URL(setupRes.body.uri);
      const secret = uri.searchParams.get("secret")!;
      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(secret),
        algorithm: "SHA1",
        digits: 6,
        period: 30,
      });

      await request(app)
        .post("/api/v1/mfa/totp/confirm")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .set("X-Reauth-Token", reauthToken)
        .send({ code: totp.generate() })
        .expect(200);

      // Disable TOTP
      await request(app)
        .delete("/api/v1/mfa/totp")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .set("X-Reauth-Token", reauthToken)
        .expect(200);

      // Login should return tokens directly
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "disabletotp@test.com", password: "Test@pass1" })
        .expect(200);

      expect(loginRes.body.accessToken).toBeDefined();
      expect(loginRes.body.mfaRequired).toBeUndefined();
    });
  });

  // ── Email MFA setup + confirm + login flow ─────────────────────

  describe("Email MFA setup and login flow", () => {
    it("enables email MFA, confirms with code, and requires MFA on login", async () => {
      const user = await registerUser({
        email: "emailmfa@test.com",
        password: "Test@pass1",
      });

      // 1. Enable email MFA — sends code
      const reauthToken = await getReauthToken(user.accessToken, "Test@pass1");
      await request(app)
        .post("/api/v1/mfa/email/enable")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .set("X-Reauth-Token", reauthToken)
        .expect(200);

      // 2. Get the hashed code from the DB and derive the raw code
      const dbUser = await testPrisma.appUser.findUnique({
        where: { email: "emailmfa@test.com" },
        select: { mfaEmailCode: true },
      });
      expect(dbUser?.mfaEmailCode).toBeTruthy();

      // We can't reverse the hash, so we'll directly set a known code
      const rawCode = "123456";
      const hashedCode = hashToken(rawCode);
      await testPrisma.appUser.update({
        where: { email: "emailmfa@test.com" },
        data: {
          mfaEmailCode: hashedCode,
          mfaEmailCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      });

      // 3. Confirm email MFA
      await request(app)
        .post("/api/v1/mfa/email/confirm")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .set("X-Reauth-Token", reauthToken)
        .send({ code: rawCode })
        .expect(200);

      // 4. Login returns MFA challenge
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "emailmfa@test.com", password: "Test@pass1" })
        .expect(200);

      expect(loginRes.body.mfaRequired).toBe(true);
      expect(loginRes.body.methods).toContain("email");

      // 5. Request email code during MFA challenge
      await request(app)
        .post("/api/v1/auth/mfa/send-email-code")
        .send({ mfaToken: loginRes.body.mfaToken })
        .expect(200);

      // 6. Set a known code again for verification
      const loginCode = "654321";
      await testPrisma.appUser.update({
        where: { email: "emailmfa@test.com" },
        data: {
          mfaEmailCode: hashToken(loginCode),
          mfaEmailCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      });

      // 7. Verify MFA with email code
      const verifyRes = await request(app)
        .post("/api/v1/auth/mfa/verify")
        .send({
          mfaToken: loginRes.body.mfaToken,
          code: loginCode,
          method: "email",
        })
        .expect(200);

      expect(verifyRes.body.accessToken).toBeDefined();
      expect(verifyRes.body.user.email).toBe("emailmfa@test.com");
    });

    it("rejects an invalid email code during verify", async () => {
      const user = await registerUser({
        email: "bademail@test.com",
        password: "Test@pass1",
      });

      // Enable email MFA with known code
      const rawCode = "111111";
      await testPrisma.appUser.update({
        where: { email: "bademail@test.com" },
        data: {
          mfaEmailEnabled: true,
          mfaEmailCode: hashToken(rawCode),
          mfaEmailCodeExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      });

      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "bademail@test.com", password: "Test@pass1" })
        .expect(200);

      // Send a wrong code
      await request(app)
        .post("/api/v1/auth/mfa/verify")
        .send({
          mfaToken: loginRes.body.mfaToken,
          code: "999999",
          method: "email",
        })
        .expect(401);
    });

    it("can disable email MFA and login without MFA", async () => {
      const user = await registerUser({
        email: "disableemail@test.com",
        password: "Test@pass1",
      });

      // Enable directly in DB
      await testPrisma.appUser.update({
        where: { email: "disableemail@test.com" },
        data: { mfaEmailEnabled: true },
      });

      // Disable email MFA
      await request(app)
        .delete("/api/v1/mfa/email")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .set(
          "X-Reauth-Token",
          await getReauthToken(user.accessToken, "Test@pass1")
        )
        .expect(200);

      // Login should return tokens directly
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "disableemail@test.com", password: "Test@pass1" })
        .expect(200);

      expect(loginRes.body.accessToken).toBeDefined();
      expect(loginRes.body.mfaRequired).toBeUndefined();
    });
  });

  // ── MFA status endpoint ────────────────────────────────────────

  describe("GET /api/v1/mfa/status", () => {
    it("returns MFA status for the authenticated user", async () => {
      const user = await registerUser({
        email: "status@test.com",
        password: "Test@pass1",
      });

      const res = await request(app)
        .get("/api/v1/mfa/status")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .expect(200);

      expect(res.body).toEqual({
        totpEnabled: false,
        emailEnabled: false,
      });
    });
  });
});
