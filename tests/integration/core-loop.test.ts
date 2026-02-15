import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { useCleanDatabase, testPrisma } from "../helpers/setup";
import { registerOwnerWithCompany } from "../helpers/auth";

describe("Core inventory loop", () => {
  useCleanDatabase();

  let owner: Awaited<ReturnType<typeof registerOwnerWithCompany>>;
  let productId: string;
  let locationId: string;

  // Set up an owner with company, product, and location before each test
  beforeEach(async () => {
    owner = await registerOwnerWithCompany();

    // Create a location (no endpoint yet, use Prisma directly)
    const location = await testPrisma.location.create({
      data: {
        companyId: owner.companyId,
        address: "100 Warehouse Blvd",
        locationType: "warehouse",
      },
    });
    locationId = location.id;

    // Create a product via the API
    const productRes = await request(app)
      .post(`/api/v1/companies/${owner.companyId}/products`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        productName: "Widget A",
        sku: "WDG-001",
        price: 29.99,
      })
      .expect(201);

    productId = productRes.body.id;
  });

  // ── POST /products ─────────────────────────────────────────────

  describe("POST /api/v1/companies/:companyId/products", () => {
    it("creates a product", async () => {
      const res = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/products`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({
          productName: "Widget B",
          sku: "WDG-002",
          price: 49.99,
          description: "A second widget",
        })
        .expect(201);

      expect(res.body.productName).toBe("Widget B");
      expect(res.body.sku).toBe("WDG-002");
    });

    it("rejects duplicate SKU with 409", async () => {
      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/products`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({
          productName: "Different Name",
          sku: "WDG-001", // same SKU as beforeEach
          price: 10,
        })
        .expect(409);
    });

    it("validates required fields", async () => {
      const res = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/products`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({})
        .expect(400);

      expect(res.body.errors.productName).toBeDefined();
      expect(res.body.errors.sku).toBeDefined();
      expect(res.body.errors.price).toBeDefined();
    });
  });

  // ── POST /inventory/receive ────────────────────────────────────

  describe("POST /inventory/receive", () => {
    it("receives stock and creates a purchase transaction", async () => {
      const res = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/inventory/receive`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({
          productId,
          locationId,
          quantity: 100,
          unitCost: 15.5,
          reference: "PO-001",
        })
        .expect(201);

      expect(res.body.inventory.quantity).toBe(100);
      expect(res.body.transaction.transactionType).toBe("purchase");
      expect(res.body.transaction.quantityChange).toBe(100);
    });

    it("increments existing inventory on second receive", async () => {
      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/inventory/receive`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ productId, locationId, quantity: 50 })
        .expect(201);

      const res = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/inventory/receive`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ productId, locationId, quantity: 30 })
        .expect(201);

      expect(res.body.inventory.quantity).toBe(80);
    });

    it("rejects unknown product with 404", async () => {
      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/inventory/receive`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({
          productId: "00000000-0000-0000-0000-000000000000",
          locationId,
          quantity: 10,
        })
        .expect(404);
    });
  });

  // ── POST /inventory/sale ───────────────────────────────────────

  describe("POST /inventory/sale", () => {
    it("sells stock and creates a sale transaction", async () => {
      // First receive stock
      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/inventory/receive`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ productId, locationId, quantity: 100 })
        .expect(201);

      // Then sell
      const res = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/inventory/sale`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({
          productId,
          locationId,
          quantity: 25,
          unitCost: 29.99,
          reference: "INV-001",
        })
        .expect(201);

      expect(res.body.inventory.quantity).toBe(75);
      expect(res.body.transaction.transactionType).toBe("sale");
      expect(res.body.transaction.quantityChange).toBe(-25);
    });

    it("rejects overselling with 400", async () => {
      // Receive 10
      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/inventory/receive`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ productId, locationId, quantity: 10 })
        .expect(201);

      // Try to sell 999
      const res = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/inventory/sale`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ productId, locationId, quantity: 999 })
        .expect(400);

      expect(res.body.error).toMatch(/insufficient/i);
    });

    it("rejects sale when no inventory exists", async () => {
      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/inventory/sale`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ productId, locationId, quantity: 1 })
        .expect(404);
    });
  });

  // ── POST /inventory/adjust ─────────────────────────────────────

  describe("POST /inventory/adjust", () => {
    it("adjusts stock down and creates an adjustment transaction", async () => {
      // Receive 100
      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/inventory/receive`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ productId, locationId, quantity: 100 })
        .expect(201);

      // Adjust -10
      const res = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/inventory/adjust`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({
          productId,
          locationId,
          quantity: -10,
          reason: "Damaged items",
          notes: "Found during inspection",
        })
        .expect(201);

      expect(res.body.inventory.quantity).toBe(90);
      expect(res.body.transaction.transactionType).toBe("adjustment");
      expect(res.body.transaction.quantityChange).toBe(-10);
      expect(res.body.transaction.reference).toBe("Damaged items");
    });

    it("adjusts stock up", async () => {
      // Receive 50
      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/inventory/receive`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ productId, locationId, quantity: 50 })
        .expect(201);

      // Adjust +5
      const res = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/inventory/adjust`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ productId, locationId, quantity: 5 })
        .expect(201);

      expect(res.body.inventory.quantity).toBe(55);
    });

    it("rejects adjustment that would go negative", async () => {
      // Receive 10
      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/inventory/receive`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ productId, locationId, quantity: 10 })
        .expect(201);

      // Try to adjust -50
      const res = await request(app)
        .post(`/api/v1/companies/${owner.companyId}/inventory/adjust`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ productId, locationId, quantity: -50 })
        .expect(400);

      expect(res.body.error).toMatch(/negative/i);
    });
  });

  // ── Full core loop ─────────────────────────────────────────────

  describe("End-to-end: create → receive → sell → adjust → verify", () => {
    it("tracks inventory correctly through the full cycle", async () => {
      // Receive 100 units
      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/inventory/receive`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ productId, locationId, quantity: 100 })
        .expect(201);

      // Sell 30
      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/inventory/sale`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ productId, locationId, quantity: 30 })
        .expect(201);

      // Adjust -5 (damaged)
      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/inventory/adjust`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ productId, locationId, quantity: -5 })
        .expect(201);

      // Receive 20 more
      await request(app)
        .post(`/api/v1/companies/${owner.companyId}/inventory/receive`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ productId, locationId, quantity: 20 })
        .expect(201);

      // Verify: 100 - 30 - 5 + 20 = 85
      const inventoryRes = await request(app)
        .get(`/api/v1/companies/${owner.companyId}/inventory`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .expect(200);

      const item = inventoryRes.body.find(
        (i: { product: { id: string } }) => i.product.id === productId
      );
      expect(item.quantity).toBe(85);

      // Verify transaction count
      const txRes = await request(app)
        .get(`/api/v1/companies/${owner.companyId}/transactions`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .expect(200);

      expect(txRes.body.length).toBe(4);
    });
  });
});
