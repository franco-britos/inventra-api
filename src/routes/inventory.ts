import { Router } from "express";
import { prisma } from "../lib/prisma";
import {
  validateUUIDParams,
  validateQuery,
  validateBody,
  param,
} from "../middleware/validate";
import { inventoryQuerySchema } from "../schemas/query";
import {
  receiveStockSchema,
  sellStockSchema,
  adjustStockSchema,
} from "../schemas/inventory";

/** Mounted at /companies/:companyId/inventory */
const router = Router({ mergeParams: true });

// ── Inventory select shape (reused across write responses) ───────
const inventorySelect = {
  id: true,
  quantity: true,
  createdAt: true,
  updatedAt: true,
  product: { select: { id: true, productName: true, sku: true, price: true } },
  location: { select: { id: true, address: true, locationType: true } },
} as const;

const transactionSelect = {
  id: true,
  transactionType: true,
  quantityChange: true,
  unitCost: true,
  reference: true,
  notes: true,
  createdAt: true,
} as const;

// ── POST /receive — Receive stock (purchase) ────────────────────
router.post("/receive", validateBody(receiveStockSchema), async (req, res) => {
  const companyId = param(req, "companyId");
  const employeeId = req.employee?.id ?? null;
  const { productId, locationId, quantity, unitCost, reference, notes } =
    req.body;

  // Verify product and location belong to this company
  const [product, location] = await Promise.all([
    prisma.product.findFirst({
      where: { id: productId, companyId },
      select: { id: true },
    }),
    prisma.location.findFirst({
      where: { id: locationId, companyId },
      select: { id: true },
    }),
  ]);

  if (!product) {
    res.status(404).json({ error: "Product not found in this company." });
    return;
  }
  if (!location) {
    res.status(404).json({ error: "Location not found in this company." });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    // Upsert: create inventory record if first receipt, otherwise increment
    const inventory = await tx.inventory.upsert({
      where: {
        productId_locationId: { productId, locationId },
      },
      create: {
        productId,
        locationId,
        companyId,
        quantity,
      },
      update: {
        quantity: { increment: quantity },
      },
      select: inventorySelect,
    });

    const transaction = await tx.inventoryTransaction.create({
      data: {
        inventoryId: inventory.id,
        companyId,
        employeeId,
        transactionType: "purchase",
        quantityChange: quantity,
        unitCost: unitCost ?? null,
        reference: reference ?? null,
        notes: notes ?? null,
      },
      select: transactionSelect,
    });

    return { inventory, transaction };
  });

  res.status(201).json(result);
});

// ── POST /sale — Sell stock ─────────────────────────────────────
router.post("/sale", validateBody(sellStockSchema), async (req, res) => {
  const companyId = param(req, "companyId");
  const employeeId = req.employee?.id ?? null;
  const { productId, locationId, quantity, unitCost, reference, notes } =
    req.body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({
        where: {
          productId_locationId: { productId, locationId },
        },
        select: { id: true, quantity: true, companyId: true },
      });

      if (!inventory || inventory.companyId !== companyId) {
        throw new Error("INVENTORY_NOT_FOUND");
      }
      if (inventory.quantity < quantity) {
        throw new Error("INSUFFICIENT_STOCK");
      }

      const updated = await tx.inventory.update({
        where: { id: inventory.id },
        data: { quantity: { decrement: quantity } },
        select: inventorySelect,
      });

      const transaction = await tx.inventoryTransaction.create({
        data: {
          inventoryId: inventory.id,
          companyId,
          employeeId,
          transactionType: "sale",
          quantityChange: -quantity,
          unitCost: unitCost ?? null,
          reference: reference ?? null,
          notes: notes ?? null,
        },
        select: transactionSelect,
      });

      return { inventory: updated, transaction };
    });

    res.status(201).json(result);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "INVENTORY_NOT_FOUND") {
        res
          .status(404)
          .json({ error: "No inventory record found for this product/location." });
        return;
      }
      if (err.message === "INSUFFICIENT_STOCK") {
        res
          .status(400)
          .json({ error: "Insufficient stock for this sale." });
        return;
      }
    }
    throw err;
  }
});

// ── POST /adjust — Manual stock adjustment ──────────────────────
router.post("/adjust", validateBody(adjustStockSchema), async (req, res) => {
  const companyId = param(req, "companyId");
  const employeeId = req.employee?.id ?? null;
  const { productId, locationId, quantity, reason, notes } = req.body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({
        where: {
          productId_locationId: { productId, locationId },
        },
        select: { id: true, quantity: true, companyId: true },
      });

      if (!inventory || inventory.companyId !== companyId) {
        throw new Error("INVENTORY_NOT_FOUND");
      }
      if (inventory.quantity + quantity < 0) {
        throw new Error("NEGATIVE_STOCK");
      }

      const updated = await tx.inventory.update({
        where: { id: inventory.id },
        data: { quantity: { increment: quantity } },
        select: inventorySelect,
      });

      const transaction = await tx.inventoryTransaction.create({
        data: {
          inventoryId: inventory.id,
          companyId,
          employeeId,
          transactionType: "adjustment",
          quantityChange: quantity,
          reference: reason ?? null,
          notes: notes ?? null,
        },
        select: transactionSelect,
      });

      return { inventory: updated, transaction };
    });

    res.status(201).json(result);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "INVENTORY_NOT_FOUND") {
        res
          .status(404)
          .json({ error: "No inventory record found for this product/location." });
        return;
      }
      if (err.message === "NEGATIVE_STOCK") {
        res
          .status(400)
          .json({ error: "Adjustment would result in negative stock." });
        return;
      }
    }
    throw err;
  }
});

/** GET / — List inventory for a company, optionally filtered by location */
router.get(
  "/",
  validateUUIDParams("companyId"),
  validateQuery(inventoryQuerySchema),
  async (req, res) => {
    const { locationId } = (req.validatedQuery ?? {}) as { locationId?: string };

    const where: { companyId: string; locationId?: string } = {
      companyId: param(req, "companyId"),
    };
    if (locationId) where.locationId = locationId;

    const inventory = await prisma.inventory.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        quantity: true,
        createdAt: true,
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
    res.json(inventory);
  }
);

/** GET /:inventoryId — Get a single inventory record */
router.get(
  "/:inventoryId",
  validateUUIDParams("companyId", "inventoryId"),
  async (req, res) => {
    const item = await prisma.inventory.findFirst({
      where: {
        id: param(req, "inventoryId"),
        companyId: param(req, "companyId"),
      },
      select: {
        id: true,
        quantity: true,
        createdAt: true,
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
        _count: {
          select: { inventoryTransactions: true },
        },
      },
    });

    if (!item) {
      res.status(404).json({ error: "Inventory record not found" });
      return;
    }
    res.json(item);
  }
);

export default router;
