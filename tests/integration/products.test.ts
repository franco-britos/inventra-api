import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { useCleanDatabase, testPrisma } from "../helpers/setup";
import { registerOwnerWithCompany, registerUser } from "../helpers/auth";

describe("Product edit/delete/archive", () => {
  useCleanDatabase();

  let owner: Awaited<ReturnType<typeof registerOwnerWithCompany>>;
  let productId: string;

  const BASE_PRODUCT = {
    productName: "Widget A",
    sku: "WDG-001",
    price: 29.99,
  };

  beforeEach(async () => {
    owner = await registerOwnerWithCompany();

    const res = await request(app)
      .post(`/api/v1/companies/${owner.companyId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(BASE_PRODUCT)
      .expect(201);

    productId = res.body.id;
  });

  function url(id = productId) {
    return `/api/v1/companies/${owner.companyId}/products/${id}`;
  }

  function productsUrl() {
    return `/api/v1/companies/${owner.companyId}/products`;
  }

  async function createStaffToken(): Promise<string> {
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

    return staff.accessToken;
  }

  // ── PATCH /products/:productId ─────────────────────────────────

  describe("PATCH /products/:productId", () => {
    it("updates product name", async () => {
      const res = await request(app)
        .patch(url())
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ productName: "Widget Pro" })
        .expect(200);

      expect(res.body.productName).toBe("Widget Pro");
      expect(res.body.sku).toBe("WDG-001");
    });

    it("updates multiple fields at once", async () => {
      const res = await request(app)
        .patch(url())
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ sku: "WDG-PRO", price: 49.99, description: "Upgraded" })
        .expect(200);

      expect(res.body.sku).toBe("WDG-PRO");
      expect(Number(res.body.price)).toBe(49.99);
      expect(res.body.description).toBe("Upgraded");
    });

    it("rejects duplicate SKU with 409", async () => {
      await request(app)
        .post(productsUrl())
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ productName: "Other", sku: "OTHER-001", price: 10 })
        .expect(201);

      await request(app)
        .patch(url())
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ sku: "OTHER-001" })
        .expect(409);
    });

    it("returns 404 for non-existent product", async () => {
      await request(app)
        .patch(url("00000000-0000-0000-0000-000000000000"))
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ productName: "Ghost" })
        .expect(404);
    });

    it("staff cannot edit products", async () => {
      const staffToken = await createStaffToken();

      await request(app)
        .patch(url())
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ productName: "Hacked" })
        .expect(403);
    });

    it("archives a product via archivedAt", async () => {
      const now = new Date().toISOString();

      const res = await request(app)
        .patch(url())
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ archivedAt: now })
        .expect(200);

      expect(res.body.archivedAt).toBeTruthy();
    });

    it("unarchives a product by setting archivedAt to null", async () => {
      await request(app)
        .patch(url())
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ archivedAt: new Date().toISOString() })
        .expect(200);

      const res = await request(app)
        .patch(url())
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ archivedAt: null })
        .expect(200);

      expect(res.body.archivedAt).toBeNull();
    });
  });

  // ── DELETE /products/:productId ────────────────────────────────

  describe("DELETE /products/:productId", () => {
    it("deletes a product with no inventory", async () => {
      await request(app)
        .delete(url())
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .expect(204);

      await request(app)
        .get(url())
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .expect(404);
    });

    it("rejects deleting a product with inventory", async () => {
      const site = await testPrisma.site.create({
        data: {
          companyId: owner.companyId,
          address: "100 Warehouse Blvd",
          siteType: "warehouse",
        },
      });

      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/inventory/receive`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ productId, siteId: site.id, quantity: 10, unitCost: 5 })
        .expect(201);

      const res = await request(app)
        .delete(url())
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .expect(409);

      expect(res.body.code).toBe("HAS_INVENTORY");
      expect(res.body.error).toMatch(/archive/i);
    });

    it("returns 404 for non-existent product", async () => {
      await request(app)
        .delete(url("00000000-0000-0000-0000-000000000000"))
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .expect(404);
    });

    it("staff cannot delete products", async () => {
      const staffToken = await createStaffToken();

      await request(app)
        .delete(url())
        .set("Authorization", `Bearer ${staffToken}`)
        .expect(403);
    });
  });

  // ── GET / (archived filtering) ─────────────────────────────────

  describe("GET /products (archive filtering)", () => {
    it("excludes archived products by default", async () => {
      await request(app)
        .patch(url())
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ archivedAt: new Date().toISOString() })
        .expect(200);

      const res = await request(app)
        .get(productsUrl())
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .expect(200);

      expect(res.body).toHaveLength(0);
    });

    it("includes archived products with ?archived=true", async () => {
      await request(app)
        .patch(url())
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ archivedAt: new Date().toISOString() })
        .expect(200);

      const res = await request(app)
        .get(`${productsUrl()}?archived=true`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].archivedAt).toBeTruthy();
    });
  });
});
