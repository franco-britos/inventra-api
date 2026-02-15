import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { useCleanDatabase } from "../helpers/setup";
import { registerUser, registerOwnerWithCompany } from "../helpers/auth";

describe("Onboarding flow", () => {
  useCleanDatabase();

  // ── POST /companies ───────────────────────────────────────────

  describe("POST /api/v1/companies", () => {
    it("creates a company with the caller as owner", async () => {
      const user = await registerUser();

      const res = await request(app)
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          companyName: "Acme Inc",
          firstName: "Jane",
          lastName: "Doe",
          jobTitle: "Founder",
        })
        .expect(201);

      expect(res.body.company.companyName).toBe("Acme Inc");
      expect(res.body.employee.role).toBe("owner");
      expect(res.body.employee.firstName).toBe("Jane");
    });

    it("validates required fields", async () => {
      const user = await registerUser();

      const res = await request(app)
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({})
        .expect(400);

      expect(res.body.errors.companyName).toBeDefined();
      expect(res.body.errors.firstName).toBeDefined();
      expect(res.body.errors.lastName).toBeDefined();
    });

    it("requires authentication", async () => {
      await request(app)
        .post("/api/v1/companies")
        .send({ companyName: "X", firstName: "A", lastName: "B" })
        .expect(401);
    });
  });

  // ── POST /companies/:companyId/invites ────────────────────────

  describe("POST /api/v1/companies/:companyId/invites", () => {
    it("owner can invite a staff member", async () => {
      const owner = await registerOwnerWithCompany();

      const res = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/invites`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({
          email: "staff@test.com",
          role: "staff",
          firstName: "Bob",
          lastName: "Staff",
        })
        .expect(201);

      expect(res.body.token).toBeDefined();
      expect(res.body.email).toBe("staff@test.com");
      expect(res.body.role).toBe("staff");
      expect(res.body.expiresAt).toBeDefined();
    });

    it("rejects duplicate pending invite", async () => {
      const owner = await registerOwnerWithCompany();

      const inviteBody = {
        email: "dupe@test.com",
        role: "staff",
        firstName: "X",
        lastName: "Y",
      };

      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/invites`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send(inviteBody)
        .expect(201);

      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/invites`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send(inviteBody)
        .expect(409);
    });

    it("non-member cannot invite", async () => {
      const owner = await registerOwnerWithCompany();
      const outsider = await registerUser();

      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/invites`)
        .set("Authorization", `Bearer ${outsider.accessToken}`)
        .send({
          email: "someone@test.com",
          role: "staff",
          firstName: "X",
          lastName: "Y",
        })
        .expect(403);
    });
  });

  // ── POST /invites/:token/accept ───────────────────────────────

  describe("POST /api/v1/invites/:token/accept", () => {
    it("invited user can accept and become an employee", async () => {
      const owner = await registerOwnerWithCompany();

      // Create invite
      const inviteRes = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/invites`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({
          email: "joiner@test.com",
          role: "staff",
          firstName: "New",
          lastName: "Employee",
        })
        .expect(201);

      const inviteToken = inviteRes.body.token;

      // Register the invited user
      const invitedUser = await registerUser({ email: "joiner@test.com" });

      // Accept invite
      const res = await request(app)
        .post(`/api/v1/invites/${inviteToken}/accept`)
        .set("Authorization", `Bearer ${invitedUser.accessToken}`)
        .expect(201);

      expect(res.body.employee.role).toBe("staff");
      expect(res.body.employee.firstName).toBe("New");
      expect(res.body.company.id).toBe(owner.companyId);
    });

    it("wrong email cannot accept invite", async () => {
      const owner = await registerOwnerWithCompany();

      const inviteRes = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/invites`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({
          email: "correct@test.com",
          role: "staff",
          firstName: "X",
          lastName: "Y",
        })
        .expect(201);

      // Different user tries to accept
      const wrongUser = await registerUser({ email: "wrong@test.com" });

      await request(app)
        .post(`/api/v1/invites/${inviteRes.body.token}/accept`)
        .set("Authorization", `Bearer ${wrongUser.accessToken}`)
        .expect(403);
    });

    it("cannot accept the same invite twice", async () => {
      const owner = await registerOwnerWithCompany();

      const inviteRes = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/invites`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({
          email: "once@test.com",
          role: "manager",
          firstName: "X",
          lastName: "Y",
        })
        .expect(201);

      const user = await registerUser({ email: "once@test.com" });

      await request(app)
        .post(`/api/v1/invites/${inviteRes.body.token}/accept`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .expect(201);

      await request(app)
        .post(`/api/v1/invites/${inviteRes.body.token}/accept`)
        .set("Authorization", `Bearer ${user.accessToken}`)
        .expect(400);
    });

    it("accepted staff can access company data", async () => {
      const owner = await registerOwnerWithCompany();

      const inviteRes = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/invites`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({
          email: "access@test.com",
          role: "staff",
          firstName: "A",
          lastName: "B",
        })
        .expect(201);

      const staff = await registerUser({ email: "access@test.com" });

      await request(app)
        .post(`/api/v1/invites/${inviteRes.body.token}/accept`)
        .set("Authorization", `Bearer ${staff.accessToken}`)
        .expect(201);

      // Staff can now view company products
      await request(app)
        .get(`/api/v1/companies/${owner.companyId}/products`)
        .set("Authorization", `Bearer ${staff.accessToken}`)
        .expect(200);
    });
  });
});
