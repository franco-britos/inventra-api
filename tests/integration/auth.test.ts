import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { useCleanDatabase, testPrisma } from "../helpers/setup";
import { registerUser } from "../helpers/auth";

describe("Auth endpoints", () => {
  useCleanDatabase();

  // ── POST /auth/register ──────────────────────────────────────

  describe("POST /api/v1/auth/register", () => {
    it("registers a new user and returns tokens", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "new@test.com", password: "Passw0rd!" })
        .expect(201);

      expect(res.body.user).toMatchObject({
        email: "new@test.com",
      });
      expect(res.body.user.id).toBeDefined();
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it("rejects duplicate email with 409", async () => {
      await registerUser({ email: "dupe@test.com" });

      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "dupe@test.com", password: "Passw0rd!" })
        .expect(409);

      expect(res.body.error).toMatch(/already exists/i);
    });

    it("validates required fields", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({})
        .expect(400);

      expect(res.body.errors).toBeDefined();
      expect(res.body.errors.email).toBeDefined();
      expect(res.body.errors.password).toBeDefined();
    });

    it("rejects short password", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "short@test.com", password: "Ab1!" })
        .expect(400);

      expect(res.body.errors.password).toMatch(/8 characters/);
    });

    it("rejects password without required character classes", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "weak@test.com", password: "alllowercase" })
        .expect(400);

      expect(res.body.errors.password).toBeDefined();
    });
  });

  // ── POST /auth/login ─────────────────────────────────────────

  describe("POST /api/v1/auth/login", () => {
    it("logs in with valid credentials", async () => {
      await registerUser({ email: "login@test.com", password: "MyP@ss1234" });

      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "login@test.com", password: "MyP@ss1234" })
        .expect(200);

      expect(res.body.user.email).toBe("login@test.com");
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it("rejects wrong password with 401", async () => {
      await registerUser({ email: "wrongpw@test.com", password: "C0rrect!pass" });

      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "wrongpw@test.com", password: "Wr0ng!pass99" })
        .expect(401);

      expect(res.body.error).toMatch(/invalid/i);
    });

    it("rejects non-existent email with 401", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "ghost@test.com", password: "anything" })
        .expect(401);

      expect(res.body.error).toMatch(/invalid/i);
    });
  });

  // ── POST /auth/refresh ────────────────────────────────────────

  describe("POST /api/v1/auth/refresh", () => {
    it("exchanges a valid refresh token for a new access token", async () => {
      const user = await registerUser();

      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: user.refreshToken })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(typeof res.body.accessToken).toBe("string");
    });

    it("rejects an invalid refresh token", async () => {
      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: "garbage-token" })
        .expect(401);

      expect(res.body.error).toMatch(/invalid|expired/i);
    });

    it("validates required body", async () => {
      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({})
        .expect(400);

      expect(res.body.errors.refreshToken).toBeDefined();
    });
  });

  // ── POST /auth/forgot-password ─────────────────────────────────

  describe("POST /api/v1/auth/forgot-password", () => {
    it("returns 200 with generic message for existing user", async () => {
      await registerUser({ email: "forgot@test.com" });

      const res = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({ email: "forgot@test.com" })
        .expect(200);

      expect(res.body.message).toMatch(/reset link/i);

      const user = await testPrisma.appUser.findUnique({
        where: { email: "forgot@test.com" },
        select: { passwordResetToken: true, passwordResetExpiresAt: true },
      });
      expect(user?.passwordResetToken).toBeTruthy();
      expect(user?.passwordResetExpiresAt).toBeTruthy();
    });

    it("returns same 200 for unknown email (no enumeration)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({ email: "ghost@test.com" })
        .expect(200);

      expect(res.body.message).toMatch(/reset link/i);
    });

    it("validates required fields", async () => {
      const res = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({})
        .expect(400);

      expect(res.body.errors.email).toBeDefined();
    });

    it("rejects invalid email format", async () => {
      const res = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({ email: "not-an-email" })
        .expect(400);

      expect(res.body.errors.email).toBeDefined();
    });
  });

  // ── POST /auth/reset-password ──────────────────────────────────

  describe("POST /api/v1/auth/reset-password", () => {
    const RAW_TOKEN = "a".repeat(64);
    const HASHED_TOKEN = crypto
      .createHash("sha256")
      .update(RAW_TOKEN)
      .digest("hex");

    async function seedResetToken(
      email: string,
      expiresAt?: Date
    ): Promise<void> {
      await testPrisma.appUser.update({
        where: { email },
        data: {
          passwordResetToken: HASHED_TOKEN,
          passwordResetExpiresAt:
            expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
        },
      });
    }

    it("resets the password with a valid token", async () => {
      await registerUser({
        email: "reset@test.com",
        password: "OldP@ss123",
      });
      await seedResetToken("reset@test.com");

      const res = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({ token: RAW_TOKEN, password: "NewP@ss456!" })
        .expect(200);

      expect(res.body.message).toMatch(/reset successfully/i);

      // Verify can login with new password
      await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "reset@test.com", password: "NewP@ss456!" })
        .expect(200);

      // Verify old password no longer works
      await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "reset@test.com", password: "OldP@ss123" })
        .expect(401);
    });

    it("clears the token after use (single-use)", async () => {
      await registerUser({ email: "once@test.com" });
      await seedResetToken("once@test.com");

      await request(app)
        .post("/api/v1/auth/reset-password")
        .send({ token: RAW_TOKEN, password: "NewP@ss789!" })
        .expect(200);

      // Second use of same token should fail
      await request(app)
        .post("/api/v1/auth/reset-password")
        .send({ token: RAW_TOKEN, password: "AnotherP@ss1" })
        .expect(400);
    });

    it("rejects an expired token", async () => {
      await registerUser({ email: "expired@test.com" });
      await seedResetToken(
        "expired@test.com",
        new Date(Date.now() - 1000) // 1 second in the past
      );

      const res = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({ token: RAW_TOKEN, password: "NewP@ss456!" })
        .expect(400);

      expect(res.body.error).toMatch(/invalid or expired/i);
    });

    it("rejects an invalid token", async () => {
      const res = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({ token: "bogus-token", password: "NewP@ss456!" })
        .expect(400);

      expect(res.body.error).toMatch(/invalid or expired/i);
    });

    it("validates password policy on reset", async () => {
      await registerUser({ email: "policy@test.com" });
      await seedResetToken("policy@test.com");

      const res = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({ token: RAW_TOKEN, password: "weak" })
        .expect(400);

      expect(res.body.errors.password).toBeDefined();
    });
  });
});
