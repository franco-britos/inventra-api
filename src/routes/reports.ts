import { Router } from "express";
import { prisma } from "../lib/prisma";
import { validateQuery, param } from "../middleware/validate";
import {
  stockBySiteQuerySchema,
  transactionHistoryQuerySchema,
  lowStockQuerySchema,
} from "../schemas/query";

/** Mounted at /companies/:companyId/reports */
const router = Router({ mergeParams: true });

// ── GET /stock-by-site ───────────────────────────────────────
// Returns inventory grouped by site with total items and total value.

router.get(
  "/stock-by-site",
  validateQuery(stockBySiteQuerySchema),
  async (req, res) => {
    const companyId = param(req, "companyId");
    const { siteId } = (req.validatedQuery ?? {}) as {
      siteId?: string;
    };

    const where: { companyId: string; siteId?: string } = { companyId };
    if (siteId) where.siteId = siteId;

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
        site: {
          select: {
            id: true,
            address: true,
            unit: true,
            city: true,
            state: true,
            zipCode: true,
            country: true,
            siteType: true,
          },
        },
      },
      orderBy: [
        { site: { address: "asc" } },
        { product: { productName: "asc" } },
      ],
    });

    // Group by site
    const siteMap = new Map<
      string,
      {
        site: { id: string; address: string; siteType: string };
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
      const siteId = row.site.id;
      if (!siteMap.has(siteId)) {
        siteMap.set(siteId, {
          site: row.site,
          items: [],
          totalItems: 0,
          totalValue: 0,
        });
      }
      const group = siteMap.get(siteId)!;
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

    res.json(Array.from(siteMap.values()));
  }
);

// ── GET /transactions ────────────────────────────────────────────
// Paginated transaction history with date range and type filtering.

router.get(
  "/transactions",
  validateQuery(transactionHistoryQuerySchema),
  async (req, res) => {
    const companyId = param(req, "companyId");
    const { transactionId, from, to, type, employeeId, productId, productName, siteId, limit } =
      (req.validatedQuery ?? {}) as {
        transactionId?: string;
        from?: Date;
        to?: Date;
        type?: string;
        employeeId?: string;
        productId?: string;
        productName?: string;
        siteId?: string;
        limit: number;
      };

    const where: Record<string, unknown> = { companyId };
    if (transactionId) where.id = transactionId;

    // Date range filter
    if (from || to) {
      const createdAt: Record<string, Date> = {};
      if (from) createdAt.gte = from;
      if (to) createdAt.lte = to;
      where.createdAt = createdAt;
    }

    if (type) where.transactionType = type;
    if (employeeId) where.employeeId = employeeId;

    const inventoryFilter: Record<string, unknown> = {};
    if (productId) inventoryFilter.productId = productId;
    if (productName) {
      inventoryFilter.product = {
        productName: { contains: productName, mode: "insensitive" },
      };
    }
    if (siteId) inventoryFilter.siteId = siteId;
    if (Object.keys(inventoryFilter).length > 0) where.inventory = inventoryFilter;

    const transactions = await prisma.inventoryTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        transactionType: true,
        quantityChange: true,
        unitCost: true,
        costBasisUnitCost: true,
        cogsAmount: true,
        reference: true,
        notes: true,
        createdAt: true,
        inventory: {
          select: {
            product: {
              select: { id: true, productName: true, sku: true },
            },
            site: {
              select: { id: true, address: true },
            },
          },
        },
        employee: {
          select: { id: true, firstName: true, lastName: true },
        },
        client: {
          select: { id: true, businessName: true, businessStoreId: true },
        },
      },
    });

    // Compute summary
    const summary = {
      count: transactions.length,
      totalIn: 0,
      totalOut: 0,
      netStockChange: 0,
      revenue: 0,
      purchaseCost: 0,
      grossProfit: 0,
    };
    for (const tx of transactions) {
      if (tx.quantityChange > 0) summary.totalIn += tx.quantityChange;
      else summary.totalOut += Math.abs(tx.quantityChange);

      if (tx.transactionType === "sale" && tx.unitCost != null) {
        summary.revenue += Math.abs(tx.quantityChange) * Number(tx.unitCost);
      }
      if (tx.transactionType === "sale") {
        const cogs =
          tx.cogsAmount != null
            ? Number(tx.cogsAmount)
            : tx.costBasisUnitCost != null
              ? Math.abs(tx.quantityChange) * Number(tx.costBasisUnitCost)
              : 0;
        summary.purchaseCost += cogs;
      }
    }
    summary.netStockChange = summary.totalIn - summary.totalOut;
    summary.revenue = Math.round(summary.revenue * 100) / 100;
    summary.purchaseCost = Math.round(summary.purchaseCost * 100) / 100;
    summary.grossProfit = Math.round((summary.revenue - summary.purchaseCost) * 100) / 100;

    res.json({ summary, transactions });
  }
);

// ── GET /low-stock ───────────────────────────────────────────────
// Returns inventory items at or below a threshold.
// When `threshold` query param is provided it acts as a global override;
// otherwise each product's own `lowStockThreshold` is used.

router.get(
  "/low-stock",
  validateQuery(lowStockQuerySchema),
  async (req, res) => {
    const companyId = param(req, "companyId");
    const { threshold, siteId } = (req.validatedQuery ?? {}) as {
      threshold?: number;
      siteId?: string;
    };

    const where: Record<string, unknown> = { companyId };
    if (siteId) where.siteId = siteId;
    if (threshold != null) where.quantity = { lte: threshold };

    const rows = await prisma.inventory.findMany({
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
            lowStockThreshold: true,
          },
        },
        site: {
          select: {
            id: true,
            address: true,
            unit: true,
            city: true,
            state: true,
            zipCode: true,
            country: true,
            siteType: true,
          },
        },
      },
    });

    const items =
      threshold != null
        ? rows
        : rows.filter((r) => r.quantity <= r.product.lowStockThreshold);

    res.json({
      threshold: threshold ?? null,
      count: items.length,
      items,
    });
  }
);

export default router;
