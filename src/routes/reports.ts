import { Router } from "express";
import { prisma } from "../lib/prisma";
import { validateQuery, param } from "../middleware/validate";
import {
  stockByLocationQuerySchema,
  transactionHistoryQuerySchema,
  lowStockQuerySchema,
} from "../schemas/query";

/** Mounted at /companies/:companyId/reports */
const router = Router({ mergeParams: true });

// ── GET /stock-by-location ───────────────────────────────────────
// Returns inventory grouped by location with total items and total value.

router.get(
  "/stock-by-location",
  validateQuery(stockByLocationQuerySchema),
  async (req, res) => {
    const companyId = param(req, "companyId");
    const { locationId } = (req.validatedQuery ?? {}) as {
      locationId?: string;
    };

    const where: { companyId: string; locationId?: string } = { companyId };
    if (locationId) where.locationId = locationId;

    const inventory = await prisma.inventory.findMany({
      where,
      select: {
        quantity: true,
        product: {
          select: {
            id: true,
            productName: true,
            sku: true,
            price: true,
          },
        },
        location: {
          select: {
            id: true,
            address: true,
            locationType: true,
          },
        },
      },
      orderBy: [
        { location: { address: "asc" } },
        { product: { productName: "asc" } },
      ],
    });

    // Group by location
    const locationMap = new Map<
      string,
      {
        location: { id: string; address: string; locationType: string };
        items: {
          product: { id: string; productName: string; sku: string; price: string };
          quantity: number;
          value: number;
        }[];
        totalItems: number;
        totalValue: number;
      }
    >();

    for (const row of inventory) {
      const locId = row.location.id;
      if (!locationMap.has(locId)) {
        locationMap.set(locId, {
          location: row.location,
          items: [],
          totalItems: 0,
          totalValue: 0,
        });
      }
      const group = locationMap.get(locId)!;
      const value = row.quantity * Number(row.product.price);
      group.items.push({
        product: {
          id: row.product.id,
          productName: row.product.productName,
          sku: row.product.sku,
          price: String(row.product.price),
        },
        quantity: row.quantity,
        value: Math.round(value * 100) / 100,
      });
      group.totalItems += row.quantity;
      group.totalValue = Math.round((group.totalValue + value) * 100) / 100;
    }

    res.json(Array.from(locationMap.values()));
  }
);

// ── GET /transactions ────────────────────────────────────────────
// Paginated transaction history with date range and type filtering.

router.get(
  "/transactions",
  validateQuery(transactionHistoryQuerySchema),
  async (req, res) => {
    const companyId = param(req, "companyId");
    const { from, to, type, employeeId, productId, limit } =
      (req.validatedQuery ?? {}) as {
        from?: Date;
        to?: Date;
        type?: string;
        employeeId?: string;
        productId?: string;
        limit: number;
      };

    const where: Record<string, unknown> = { companyId };

    // Date range filter
    if (from || to) {
      const createdAt: Record<string, Date> = {};
      if (from) createdAt.gte = from;
      if (to) createdAt.lte = to;
      where.createdAt = createdAt;
    }

    if (type) where.transactionType = type;
    if (employeeId) where.employeeId = employeeId;
    if (productId) where.inventory = { productId };

    const transactions = await prisma.inventoryTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        transactionType: true,
        quantityChange: true,
        unitCost: true,
        reference: true,
        notes: true,
        createdAt: true,
        inventory: {
          select: {
            product: {
              select: { id: true, productName: true, sku: true },
            },
            location: {
              select: { id: true, address: true },
            },
          },
        },
        employee: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // Compute summary
    const summary = {
      count: transactions.length,
      totalIn: 0,
      totalOut: 0,
    };
    for (const tx of transactions) {
      if (tx.quantityChange > 0) summary.totalIn += tx.quantityChange;
      else summary.totalOut += Math.abs(tx.quantityChange);
    }

    res.json({ summary, transactions });
  }
);

// ── GET /low-stock ───────────────────────────────────────────────
// Returns inventory items at or below a threshold (default 10).

router.get(
  "/low-stock",
  validateQuery(lowStockQuerySchema),
  async (req, res) => {
    const companyId = param(req, "companyId");
    const { threshold, locationId } = (req.validatedQuery ?? {}) as {
      threshold: number;
      locationId?: string;
    };

    const where: Record<string, unknown> = {
      companyId,
      quantity: { lte: threshold },
    };
    if (locationId) where.locationId = locationId;

    const items = await prisma.inventory.findMany({
      where,
      orderBy: { quantity: "asc" },
      select: {
        id: true,
        quantity: true,
        updatedAt: true,
        product: {
          select: {
            id: true,
            productName: true,
            sku: true,
            price: true,
          },
        },
        location: {
          select: {
            id: true,
            address: true,
            locationType: true,
          },
        },
      },
    });

    res.json({
      threshold,
      count: items.length,
      items,
    });
  }
);

export default router;
