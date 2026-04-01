import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app";
import { useCleanDatabase, testPrisma } from "../helpers/setup";
import { registerOwnerWithCompany } from "../helpers/auth";

describe("Reporting endpoints", () => {
  useCleanDatabase();

  let owner: Awaited<ReturnType<typeof registerOwnerWithCompany>>;
  let productAId: string;
  let productBId: string;
  let warehouseId: string;
  let storeId: string;
  let clientId: string;

  const base = () => `/api/v1/companies/${owner.companyId}/reports`;
  const auth = () => ({ Authorization: `Bearer ${owner.accessToken}` });

  // Seed: 2 sites, 2 products, various stock levels + transactions
  beforeEach(async () => {
    owner = await registerOwnerWithCompany();

    // Create two sites
    const [warehouse, store] = await Promise.all([
      testPrisma.site.create({
        data: {
          companyId: owner.companyId,
          address: "100 Warehouse Blvd",
          siteType: "warehouse",
        },
      }),
      testPrisma.site.create({
        data: {
          companyId: owner.companyId,
          address: "200 Store Ave",
          siteType: "store",
        },
      }),
    ]);
    warehouseId = warehouse.id;
    storeId = store.id;

    const client = await testPrisma.client.create({
      data: {
        companyId: owner.companyId,
        businessName: "Main Street Market",
        businessStoreId: "MSM-001",
        address: "1 Buyer Plaza",
        pointOfContactName: "Jordan Lee",
        phoneNumber: "+1 555-220-3333",
        email: "jordan@msm.com",
        preferredPaymentMethod: "cash",
        paymentPreference: "Payment in 2 weeks",
      },
    });
    clientId = client.id;

    // Create two products
    const prodA = await request(app)
      .post(`/api/v1/companies/${owner.companyId}/products`)
      .set(auth())
      .send({ productName: "Widget A", sku: "WDG-A", price: 10.0 })
      .expect(201);
    productAId = prodA.body.id;

    const prodB = await request(app)
      .post(`/api/v1/companies/${owner.companyId}/products`)
      .set(auth())
      .send({ productName: "Widget B", sku: "WDG-B", price: 25.5 })
      .expect(201);
    productBId = prodB.body.id;

    // Receive stock:
    // Widget A: 100 at warehouse, 5 at store (low stock)
    // Widget B: 3 at warehouse (low stock)
    await request(app)
      .post(`/api/v1/companies/${owner.companyId}/inventory/receive`)
      .set(auth())
      .send({ productId: productAId, siteId: warehouseId, quantity: 100, unitCost: 10 })
      .expect(201);
    await request(app)
      .post(`/api/v1/companies/${owner.companyId}/inventory/receive`)
      .set(auth())
      .send({ productId: productAId, siteId: storeId, quantity: 5, unitCost: 10 })
      .expect(201);
    await request(app)
      .post(`/api/v1/companies/${owner.companyId}/inventory/receive`)
      .set(auth())
      .send({ productId: productBId, siteId: warehouseId, quantity: 3, unitCost: 20 })
      .expect(201);

    // Sell 10 of Widget A from warehouse
    await request(app)
      .post(`/api/v1/companies/${owner.companyId}/inventory/sale`)
      .set(auth())
      .send({
        productId: productAId,
        siteId: warehouseId,
        clientId,
        quantity: 10,
        reference: "INV-001",
      })
      .expect(201);
  });

  // ── GET /reports/stock-by-site ────────────────────────────

  describe("GET /reports/stock-by-site", () => {
    it("returns stock grouped by site with totals", async () => {
      const res = await request(app)
        .get(`${base()}/stock-by-site`)
        .set(auth())
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2); // warehouse + store

      // Find the warehouse group
      const warehouseGroup = res.body.find(
        (g: { site: { id: string } }) => g.site.id === warehouseId
      );
      expect(warehouseGroup).toBeDefined();
      expect(warehouseGroup.items.length).toBe(2); // Widget A + Widget B
      expect(warehouseGroup.totalItems).toBe(93); // (100-10) + 3

      // Find the store group
      const storeGroup = res.body.find(
        (g: { site: { id: string } }) => g.site.id === storeId
      );
      expect(storeGroup).toBeDefined();
      expect(storeGroup.items.length).toBe(1); // Widget A only
      expect(storeGroup.totalItems).toBe(5);
    });

    it("filters by siteId", async () => {
      const res = await request(app)
        .get(`${base()}/stock-by-site`)
        .query({ siteId: storeId })
        .set(auth())
        .expect(200);

      expect(res.body.length).toBe(1);
      expect(res.body[0].site.id).toBe(storeId);
    });

    it("includes value calculations", async () => {
      const res = await request(app)
        .get(`${base()}/stock-by-site`)
        .query({ siteId: warehouseId })
        .set(auth())
        .expect(200);

      const group = res.body[0];
      // Widget A: 90 * 10.00 = 900.00, Widget B: 3 * 25.50 = 76.50
      expect(group.totalValue).toBeCloseTo(976.5, 2);
    });
  });

  // ── GET /reports/transactions ─────────────────────────────────

  describe("GET /reports/transactions", () => {
    it("returns transaction history with summary", async () => {
      const res = await request(app)
        .get(`${base()}/transactions`)
        .set(auth())
        .expect(200);

      expect(res.body.summary).toBeDefined();
      expect(res.body.transactions).toBeDefined();

      // 3 receives + 1 sale = 4 transactions
      expect(res.body.summary.count).toBe(4);
      expect(res.body.summary.totalIn).toBe(108); // 100 + 5 + 3
      expect(res.body.summary.totalOut).toBe(10); // sale of 10
      expect(typeof res.body.summary.netStockChange).toBe("number");
      expect(typeof res.body.summary.revenue).toBe("number");
      expect(typeof res.body.summary.purchaseCost).toBe("number");
      expect(typeof res.body.summary.grossProfit).toBe("number");
      expect(res.body.summary.purchaseCost).toBeCloseTo(100, 2);
    });

    it("filters by transaction type", async () => {
      const res = await request(app)
        .get(`${base()}/transactions`)
        .query({ type: "sale" })
        .set(auth())
        .expect(200);

      expect(res.body.summary.count).toBe(1);
      expect(res.body.transactions[0].transactionType).toBe("sale");
    });

    it("filters by productId", async () => {
      const res = await request(app)
        .get(`${base()}/transactions`)
        .query({ productId: productBId })
        .set(auth())
        .expect(200);

      // Only Widget B receive
      expect(res.body.summary.count).toBe(1);
      expect(res.body.transactions[0].inventory.product.id).toBe(productBId);
    });

    it("filters by productName (case-insensitive partial match)", async () => {
      const res = await request(app)
        .get(`${base()}/transactions`)
        .query({ productName: "widget b" })
        .set(auth())
        .expect(200);

      expect(res.body.summary.count).toBe(1);
      expect(res.body.transactions[0].inventory.product.productName).toBe("Widget B");
    });

    it("respects limit", async () => {
      const res = await request(app)
        .get(`${base()}/transactions`)
        .query({ limit: 2 })
        .set(auth())
        .expect(200);

      expect(res.body.transactions.length).toBe(2);
    });

    it("filters by transactionId", async () => {
      const all = await request(app)
        .get(`${base()}/transactions`)
        .set(auth())
        .expect(200);

      const targetId = all.body.transactions[0].id;

      const res = await request(app)
        .get(`${base()}/transactions`)
        .query({ transactionId: targetId })
        .set(auth())
        .expect(200);

      expect(res.body.summary.count).toBe(1);
      expect(res.body.transactions).toHaveLength(1);
      expect(res.body.transactions[0].id).toBe(targetId);
    });

    it("filters by date range", async () => {
      // All data was created just now, so a past date should return everything
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const res = await request(app)
        .get(`${base()}/transactions`)
        .query({
          from: yesterday.toISOString(),
          to: tomorrow.toISOString(),
        })
        .set(auth())
        .expect(200);

      expect(res.body.summary.count).toBe(4);

      // A far-future range should return nothing
      const futureStart = new Date("2099-01-01");
      const futureEnd = new Date("2099-12-31");

      const empty = await request(app)
        .get(`${base()}/transactions`)
        .query({
          from: futureStart.toISOString(),
          to: futureEnd.toISOString(),
        })
        .set(auth())
        .expect(200);

      expect(empty.body.summary.count).toBe(0);
    });
  });

  // ── GET /reports/low-stock ────────────────────────────────────

  describe("GET /reports/low-stock", () => {
    it("uses per-product threshold when no global override", async () => {
      const res = await request(app)
        .get(`${base()}/low-stock`)
        .set(auth())
        .expect(200);

      expect(res.body.threshold).toBeNull();
      // Both products default to threshold 10
      // Widget A@store (5) + Widget B@warehouse (3) are below 10
      expect(res.body.count).toBe(2);

      // Should be sorted by quantity ascending
      expect(res.body.items[0].quantity).toBeLessThanOrEqual(
        res.body.items[1].quantity
      );

      // Each item should include the product's lowStockThreshold
      expect(res.body.items[0].product.lowStockThreshold).toBe(10);
    });

    it("respects custom threshold", async () => {
      const res = await request(app)
        .get(`${base()}/low-stock`)
        .query({ threshold: 3 })
        .set(auth())
        .expect(200);

      expect(res.body.threshold).toBe(3);
      expect(res.body.count).toBe(1); // Only Widget B@warehouse (3)
      expect(res.body.items[0].product.sku).toBe("WDG-B");
    });

    it("respects per-product custom threshold", async () => {
      // Set Widget A threshold to 2 (below its store qty of 5)
      await request(app)
        .patch(`/api/v1/companies/${owner.companyId}/products/${productAId}`)
        .set(auth())
        .send({ lowStockThreshold: 2 })
        .expect(200);

      const res = await request(app)
        .get(`${base()}/low-stock`)
        .set(auth())
        .expect(200);

      expect(res.body.threshold).toBeNull();
      // Widget A@store (5) is above its threshold (2) → excluded
      // Widget A@warehouse (90) is above its threshold (2) → excluded
      // Widget B@warehouse (3) is at or below default 10 → included
      expect(res.body.count).toBe(1);
      expect(res.body.items[0].product.sku).toBe("WDG-B");
    });

    it("returns nothing when all stock is above threshold", async () => {
      const res = await request(app)
        .get(`${base()}/low-stock`)
        .query({ threshold: 0 })
        .set(auth())
        .expect(200);

      expect(res.body.count).toBe(0);
      expect(res.body.items.length).toBe(0);
    });

    it("filters by site", async () => {
      const res = await request(app)
        .get(`${base()}/low-stock`)
        .query({ siteId: storeId })
        .set(auth())
        .expect(200);

      // Only Widget A at store (qty 5)
      expect(res.body.count).toBe(1);
      expect(res.body.items[0].site.id).toBe(storeId);
    });

    it("includes product and site details", async () => {
      const res = await request(app)
        .get(`${base()}/low-stock`)
        .set(auth())
        .expect(200);

      const item = res.body.items[0];
      expect(item.product).toBeDefined();
      expect(item.product.productName).toBeDefined();
      expect(item.product.sku).toBeDefined();
      expect(item.site).toBeDefined();
      expect(item.site.address).toBeDefined();
    });
  });

  // ── Authorization ────────────────────────────────────────────

  describe("Authorization", () => {
    it("rejects unauthenticated requests", async () => {
      await request(app)
        .get(`${base()}/stock-by-site`)
        .expect(401);
    });

    it("rejects requests from non-members", async () => {
      const outsider = await (
        await import("../helpers/auth")
      ).registerUser();

      await request(app)
        .get(`${base()}/low-stock`)
        .set({ Authorization: `Bearer ${outsider.accessToken}` })
        .expect(403);
    });
  });
});
