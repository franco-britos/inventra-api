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

  const base = () => `/api/v1/companies/${owner.companyId}/reports`;
  const auth = () => ({ Authorization: `Bearer ${owner.accessToken}` });

  // Seed: 2 locations, 2 products, various stock levels + transactions
  beforeEach(async () => {
    owner = await registerOwnerWithCompany();

    // Create two locations
    const [warehouse, store] = await Promise.all([
      testPrisma.location.create({
        data: {
          companyId: owner.companyId,
          address: "100 Warehouse Blvd",
          locationType: "warehouse",
        },
      }),
      testPrisma.location.create({
        data: {
          companyId: owner.companyId,
          address: "200 Store Ave",
          locationType: "store",
        },
      }),
    ]);
    warehouseId = warehouse.id;
    storeId = store.id;

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
      .send({ productId: productAId, locationId: warehouseId, quantity: 100 })
      .expect(201);
    await request(app)
      .post(`/api/v1/companies/${owner.companyId}/inventory/receive`)
      .set(auth())
      .send({ productId: productAId, locationId: storeId, quantity: 5 })
      .expect(201);
    await request(app)
      .post(`/api/v1/companies/${owner.companyId}/inventory/receive`)
      .set(auth())
      .send({ productId: productBId, locationId: warehouseId, quantity: 3 })
      .expect(201);

    // Sell 10 of Widget A from warehouse
    await request(app)
      .post(`/api/v1/companies/${owner.companyId}/inventory/sale`)
      .set(auth())
      .send({
        productId: productAId,
        locationId: warehouseId,
        quantity: 10,
        reference: "INV-001",
      })
      .expect(201);
  });

  // ── GET /reports/stock-by-location ────────────────────────────

  describe("GET /reports/stock-by-location", () => {
    it("returns stock grouped by location with totals", async () => {
      const res = await request(app)
        .get(`${base()}/stock-by-location`)
        .set(auth())
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2); // warehouse + store

      // Find the warehouse group
      const warehouseGroup = res.body.find(
        (g: { location: { id: string } }) => g.location.id === warehouseId
      );
      expect(warehouseGroup).toBeDefined();
      expect(warehouseGroup.items.length).toBe(2); // Widget A + Widget B
      expect(warehouseGroup.totalItems).toBe(93); // (100-10) + 3

      // Find the store group
      const storeGroup = res.body.find(
        (g: { location: { id: string } }) => g.location.id === storeId
      );
      expect(storeGroup).toBeDefined();
      expect(storeGroup.items.length).toBe(1); // Widget A only
      expect(storeGroup.totalItems).toBe(5);
    });

    it("filters by locationId", async () => {
      const res = await request(app)
        .get(`${base()}/stock-by-location`)
        .query({ locationId: storeId })
        .set(auth())
        .expect(200);

      expect(res.body.length).toBe(1);
      expect(res.body[0].location.id).toBe(storeId);
    });

    it("includes value calculations", async () => {
      const res = await request(app)
        .get(`${base()}/stock-by-location`)
        .query({ locationId: warehouseId })
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

    it("respects limit", async () => {
      const res = await request(app)
        .get(`${base()}/transactions`)
        .query({ limit: 2 })
        .set(auth())
        .expect(200);

      expect(res.body.transactions.length).toBe(2);
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
    it("returns items at or below default threshold (10)", async () => {
      const res = await request(app)
        .get(`${base()}/low-stock`)
        .set(auth())
        .expect(200);

      expect(res.body.threshold).toBe(10);
      expect(res.body.count).toBe(2); // Widget A@store (5) + Widget B@warehouse (3)

      // Should be sorted by quantity ascending
      expect(res.body.items[0].quantity).toBeLessThanOrEqual(
        res.body.items[1].quantity
      );
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

    it("returns nothing when all stock is above threshold", async () => {
      const res = await request(app)
        .get(`${base()}/low-stock`)
        .query({ threshold: 0 })
        .set(auth())
        .expect(200);

      expect(res.body.count).toBe(0);
      expect(res.body.items.length).toBe(0);
    });

    it("filters by location", async () => {
      const res = await request(app)
        .get(`${base()}/low-stock`)
        .query({ locationId: storeId })
        .set(auth())
        .expect(200);

      // Only Widget A at store (qty 5)
      expect(res.body.count).toBe(1);
      expect(res.body.items[0].location.id).toBe(storeId);
    });

    it("includes product and location details", async () => {
      const res = await request(app)
        .get(`${base()}/low-stock`)
        .set(auth())
        .expect(200);

      const item = res.body.items[0];
      expect(item.product).toBeDefined();
      expect(item.product.productName).toBeDefined();
      expect(item.product.sku).toBeDefined();
      expect(item.location).toBeDefined();
      expect(item.location.address).toBeDefined();
    });
  });

  // ── Authorization ────────────────────────────────────────────

  describe("Authorization", () => {
    it("rejects unauthenticated requests", async () => {
      await request(app)
        .get(`${base()}/stock-by-location`)
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
