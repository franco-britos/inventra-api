import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { useCleanDatabase } from "../helpers/setup";
import { registerUser } from "../helpers/auth";

describe("Auth endpoints", () => {
  useCleanDatabase();

  // ── POST /auth/register ──────────────────────────────────────

  describe("POST /api/v1/auth/register", () => {
    it("registers a new user and returns tokens", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "new@test.com", password: "password123" })
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
        .send({ email: "dupe@test.com", password: "password123" })
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
        .send({ email: "short@test.com", password: "abc" })
        .expect(400);

      expect(res.body.errors.password).toMatch(/8 characters/);
    });
  });

  // ── POST /auth/login ─────────────────────────────────────────

  describe("POST /api/v1/auth/login", () => {
    it("logs in with valid credentials", async () => {
      await registerUser({ email: "login@test.com", password: "mypassword" });

      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "login@test.com", password: "mypassword" })
        .expect(200);

      expect(res.body.user.email).toBe("login@test.com");
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it("rejects wrong password with 401", async () => {
      await registerUser({ email: "wrongpw@test.com", password: "correctpassword" });

      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "wrongpw@test.com", password: "incorrectpassword" })
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
});
