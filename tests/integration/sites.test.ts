import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { useCleanDatabase } from "../helpers/setup";
import { registerUser, registerOwnerWithCompany } from "../helpers/auth";

describe("Site management", () => {
  useCleanDatabase();

  // ── POST /companies (with sites at registration) ──────────

  describe("POST /api/v1/companies — with initial sites", () => {
    it("creates a company with sites in a single request", async () => {
      const user = await registerUser();

      const res = await request(app)
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          companyName: "Multi-Site Corp",
          firstName: "Jane",
          lastName: "Doe",
          sites: [
            { address: "100 Warehouse Blvd", siteType: "warehouse" },
            { address: "200 Store Ave", siteType: "store" },
          ],
        })
        .expect(201);

      expect(res.body.company.companyName).toBe("Multi-Site Corp");
      expect(res.body.employee.role).toBe("owner");
      expect(res.body.sites).toHaveLength(2);
      expect(res.body.sites[0].address).toBe("100 Warehouse Blvd");
      expect(res.body.sites[0].siteType).toBe("warehouse");
      expect(res.body.sites[1].address).toBe("200 Store Ave");
      expect(res.body.sites[1].siteType).toBe("store");
    });

    it("creates a company with structured address fields on sites", async () => {
      const user = await registerUser();

      const res = await request(app)
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          companyName: "Structured Addr Corp",
          firstName: "Jane",
          lastName: "Doe",
          sites: [
            {
              address: "100 Warehouse Blvd",
              unit: "Suite 300",
              city: "Denver",
              state: "CO",
              zipCode: "80202",
              country: "US",
              placeId: "ChIJ_abc123",
              siteType: "warehouse",
            },
          ],
        })
        .expect(201);

      expect(res.body.sites).toHaveLength(1);
      const site = res.body.sites[0];
      expect(site.address).toBe("100 Warehouse Blvd");
      expect(site.unit).toBe("Suite 300");
      expect(site.city).toBe("Denver");
      expect(site.state).toBe("CO");
      expect(site.zipCode).toBe("80202");
      expect(site.country).toBe("US");
      expect(site.placeId).toBe("ChIJ_abc123");
    });

    it("creates a company with a vehicle site without address", async () => {
      const user = await registerUser();

      const res = await request(app)
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          companyName: "Mobile Ops Corp",
          firstName: "Jane",
          lastName: "Doe",
          sites: [
            {
              siteType: "vehicle",
              vin: "1HGCM82633A123456",
              licensePlate: "MOB-100",
              shortDescription: "City route van",
            },
          ],
        })
        .expect(201);

      expect(res.body.sites).toHaveLength(1);
      expect(res.body.sites[0].siteType).toBe("vehicle");
      expect(res.body.sites[0].vin).toBe("1HGCM82633A123456");
      expect(res.body.sites[0].licensePlate).toBe("MOB-100");
      expect(res.body.sites[0].shortDescription).toBe("City route van");
    });

    it("creates a company without sites (still valid)", async () => {
      const user = await registerUser();

      const res = await request(app)
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          companyName: "No Sites Inc",
          firstName: "John",
          lastName: "Doe",
        })
        .expect(201);

      expect(res.body.sites).toEqual([]);
    });

    it("rejects invalid site type in the array", async () => {
      const user = await registerUser();

      const res = await request(app)
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          companyName: "Bad Site Corp",
          firstName: "X",
          lastName: "Y",
          sites: [{ address: "123 Main", siteType: "garage" }],
        })
        .expect(400);

      expect(res.body.errors).toBeDefined();
    });

    it("rejects empty sites array", async () => {
      const user = await registerUser();

      await request(app)
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${user.accessToken}`)
        .send({
          companyName: "Empty Site Corp",
          firstName: "X",
          lastName: "Y",
          sites: [],
        })
        .expect(400);
    });
  });

  // ── POST /companies/:companyId/sites (standalone) ──────────

  describe("POST /api/v1/companies/:companyId/sites", () => {
    it("owner creates a site", async () => {
      const owner = await registerOwnerWithCompany();

      const res = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/sites`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ address: "500 New Warehouse", siteType: "warehouse" })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.address).toBe("500 New Warehouse");
      expect(res.body.siteType).toBe("warehouse");
      // New fields should be null when not provided
      expect(res.body.unit).toBeNull();
      expect(res.body.city).toBeNull();
      expect(res.body.state).toBeNull();
      expect(res.body.zipCode).toBeNull();
      expect(res.body.country).toBeNull();
      expect(res.body.placeId).toBeNull();
    });

    it("creates a site with structured address fields including unit", async () => {
      const owner = await registerOwnerWithCompany();

      const res = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/sites`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({
          address: "456 Market St",
          unit: "Apt 4B",
          city: "San Francisco",
          state: "CA",
          zipCode: "94105",
          country: "US",
          placeId: "ChIJ_xyz789",
          siteType: "store",
        })
        .expect(201);

      expect(res.body.address).toBe("456 Market St");
      expect(res.body.unit).toBe("Apt 4B");
      expect(res.body.city).toBe("San Francisco");
      expect(res.body.state).toBe("CA");
      expect(res.body.zipCode).toBe("94105");
      expect(res.body.country).toBe("US");
      expect(res.body.placeId).toBe("ChIJ_xyz789");
      expect(res.body.siteType).toBe("store");
    });

    it("creates a vehicle site with required VIN and optional plate/description", async () => {
      const owner = await registerOwnerWithCompany();

      const res = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/sites`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({
          siteType: "vehicle",
          vin: "1FTFW1ET4EFA12345",
          licensePlate: "TRK-700",
          shortDescription: "Downtown route",
        })
        .expect(201);

      expect(res.body.siteType).toBe("vehicle");
      expect(res.body.vin).toBe("1FTFW1ET4EFA12345");
      expect(res.body.licensePlate).toBe("TRK-700");
      expect(res.body.shortDescription).toBe("Downtown route");
    });

    it("rejects vehicle site without VIN", async () => {
      const owner = await registerOwnerWithCompany();

      const res = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/sites`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({
          siteType: "vehicle",
        })
        .expect(400);

      expect(res.body.errors?.vin).toBe("VIN is required for vehicle sites.");
    });

    it("GET /sites returns structured address fields", async () => {
      const owner = await registerOwnerWithCompany();

      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/sites`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({
          address: "789 Broadway",
          city: "New York",
          state: "NY",
          zipCode: "10003",
          country: "US",
          siteType: "store",
        })
        .expect(201);

      const listRes = await request(app)
        .get(`/api/v1/companies/${owner.companyId}/sites`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .expect(200);

      const site = listRes.body.find(
        (l: { address: string }) => l.address === "789 Broadway"
      );
      expect(site).toBeDefined();
      expect(site.city).toBe("New York");
      expect(site.state).toBe("NY");
      expect(site.zipCode).toBe("10003");
    });

    it("validates required fields for physical sites", async () => {
      const owner = await registerOwnerWithCompany();

      const res = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/sites`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ siteType: "store" })
        .expect(400);

      expect(res.body.errors.address).toBeDefined();
    });

    it("staff cannot create sites", async () => {
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

      // Staff tries to create a site
      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/sites`)
        .set("Authorization", `Bearer ${staff.accessToken}`)
        .send({ address: "999 Blocked Rd", siteType: "store" })
        .expect(403);
    });

    it("manager can create sites", async () => {
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

      // Manager creates a site
      const res = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/sites`)
        .set("Authorization", `Bearer ${mgr.accessToken}`)
        .send({ address: "300 Manager HQ", siteType: "store" })
        .expect(201);

      expect(res.body.address).toBe("300 Manager HQ");
    });

    it("non-member cannot create sites", async () => {
      const owner = await registerOwnerWithCompany();
      const outsider = await registerUser();

      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/sites`)
        .set("Authorization", `Bearer ${outsider.accessToken}`)
        .send({ address: "Nope", siteType: "warehouse" })
        .expect(403);
    });

    it("new site appears in GET /sites list", async () => {
      const owner = await registerOwnerWithCompany();

      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/sites`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ address: "First Site", siteType: "warehouse" })
        .expect(201);

      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/sites`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ address: "Second Site", siteType: "store" })
        .expect(201);

      const listRes = await request(app)
        .get(`/api/v1/companies/${owner.companyId}/sites`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .expect(200);

      expect(listRes.body).toHaveLength(2);
    });
  });
});
