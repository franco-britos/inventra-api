import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { useCleanDatabase } from "../helpers/setup";
import { registerUser, registerOwnerWithCompany } from "../helpers/auth";

describe("Location management", () => {
  useCleanDatabase();

  // ── POST /companies (with locations at registration) ──────────

  describe("POST /api/v1/companies — with initial locations", () => {
    it("creates a company with locations in a single request", async () => {
      const user = await registerUser();

      const res = await request(app)
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          companyName: "Multi-Location Corp",
          firstName: "Jane",
          lastName: "Doe",
          locations: [
            { address: "100 Warehouse Blvd", locationType: "warehouse" },
            { address: "200 Store Ave", locationType: "store" },
          ],
        })
        .expect(201);

      expect(res.body.company.companyName).toBe("Multi-Location Corp");
      expect(res.body.employee.role).toBe("owner");
      expect(res.body.locations).toHaveLength(2);
      expect(res.body.locations[0].address).toBe("100 Warehouse Blvd");
      expect(res.body.locations[0].locationType).toBe("warehouse");
      expect(res.body.locations[1].address).toBe("200 Store Ave");
      expect(res.body.locations[1].locationType).toBe("store");
    });

    it("creates a company without locations (still valid)", async () => {
      const user = await registerUser();

      const res = await request(app)
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          companyName: "No Locations Inc",
          firstName: "John",
          lastName: "Doe",
        })
        .expect(201);

      expect(res.body.locations).toEqual([]);
    });

    it("rejects invalid location type in the array", async () => {
      const user = await registerUser();

      const res = await request(app)
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          companyName: "Bad Location Corp",
          firstName: "X",
          lastName: "Y",
          locations: [{ address: "123 Main", locationType: "garage" }],
        })
        .expect(400);

      expect(res.body.errors).toBeDefined();
    });

    it("rejects empty locations array", async () => {
      const user = await registerUser();

      await request(app)
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          companyName: "Empty Loc Corp",
          firstName: "X",
          lastName: "Y",
          locations: [],
        })
        .expect(400);
    });
  });

  // ── POST /companies/:companyId/locations (standalone) ──────────

  describe("POST /api/v1/companies/:companyId/locations", () => {
    it("owner creates a location", async () => {
      const owner = await registerOwnerWithCompany();

      const res = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/locations`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ address: "500 New Warehouse", locationType: "warehouse" })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.address).toBe("500 New Warehouse");
      expect(res.body.locationType).toBe("warehouse");
    });

    it("validates required fields", async () => {
      const owner = await registerOwnerWithCompany();

      const res = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/locations`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({})
        .expect(400);

      expect(res.body.errors.address).toBeDefined();
      expect(res.body.errors.locationType).toBeDefined();
    });

    it("staff cannot create locations", async () => {
      const owner = await registerOwnerWithCompany();

      // Invite a staff member
      const inviteRes = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/invites`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({
          email: "staff@test.com",
          role: "staff",
          firstName: "Bob",
          lastName: "Staff",
        })
        .expect(201);

      const staff = await registerUser({ email: "staff@test.com" });

      await request(app)
        .post(`/api/v1/invites/${inviteRes.body.token}/accept`)
        .set("Authorization", `Bearer ${staff.accessToken}`)
        .expect(201);

      // Staff tries to create a location
      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/locations`)
        .set("Authorization", `Bearer ${staff.accessToken}`)
        .send({ address: "999 Blocked Rd", locationType: "store" })
        .expect(403);
    });

    it("manager can create locations", async () => {
      const owner = await registerOwnerWithCompany();

      // Invite a manager
      const inviteRes = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/invites`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({
          email: "mgr@test.com",
          role: "manager",
          firstName: "Alice",
          lastName: "Mgr",
        })
        .expect(201);

      const mgr = await registerUser({ email: "mgr@test.com" });

      await request(app)
        .post(`/api/v1/invites/${inviteRes.body.token}/accept`)
        .set("Authorization", `Bearer ${mgr.accessToken}`)
        .expect(201);

      // Manager creates a location
      const res = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/locations`)
        .set("Authorization", `Bearer ${mgr.accessToken}`)
        .send({ address: "300 Manager HQ", locationType: "store" })
        .expect(201);

      expect(res.body.address).toBe("300 Manager HQ");
    });

    it("non-member cannot create locations", async () => {
      const owner = await registerOwnerWithCompany();
      const outsider = await registerUser();

      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/locations`)
        .set("Authorization", `Bearer ${outsider.accessToken}`)
        .send({ address: "Nope", locationType: "warehouse" })
        .expect(403);
    });

    it("new location appears in GET /locations list", async () => {
      const owner = await registerOwnerWithCompany();

      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/locations`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ address: "First Location", locationType: "warehouse" })
        .expect(201);

      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/locations`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ address: "Second Location", locationType: "store" })
        .expect(201);

      const listRes = await request(app)
        .get(`/api/v1/companies/${owner.companyId}/locations`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .expect(200);

      expect(listRes.body).toHaveLength(2);
    });
  });
});
