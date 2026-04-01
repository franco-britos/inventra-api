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
  transferStockSchema,
} from "../schemas/inventory";

/** Mounted at /companies/:companyId/inventory */
const router = Router({ mergeParams: true });

// ── Inventory select shape (reused across write responses) ───────
const inventorySelect = {
  id: true,
  quantity: true,
  averageUnitCost: true,
  createdAt: true,
  updatedAt: true,
  product: { select: { id: true, productName: true, sku: true, price: true } },
  site: { select: { id: true, address: true, siteType: true } },
} as const;

const transactionSelect = {
  id: true,
  transactionType: true,
  quantityChange: true,
  unitCost: true,
  costBasisUnitCost: true,
  cogsAmount: true,
  reference: true,
  notes: true,
  createdAt: true,
  client: {
    select: {
      id: true,
      businessName: true,
      businessStoreId: true,
    },
  },
} as const;

// ── POST /receive — Receive stock (purchase) ────────────────────
router.post("/receive", validateBody(receiveStockSchema), async (req, res) => {
  const companyId = param(req, "companyId");
  const employeeId = req.employee?.id ?? null;
  const { productId, siteId, quantity, unitCost, reference, notes } =
    req.body;

  // Verify product and site belong to this company
  const [product, site] = await Promise.all([
    prisma.product.findFirst({
      where: { id: productId, companyId },
      select: { id: true },
    }),
    prisma.site.findFirst({
      where: { id: siteId, companyId },
      select: { id: true },
    }),
  ]);

  if (!product) {
    res.status(404).json({ error: "Product not found in this company." });
    return;
  }
  if (!site) {
    res.status(404).json({ error: "Site not found in this company." });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.inventory.findUnique({
      where: {
        productId_siteId: { productId, siteId },
      },
      select: { id: true, quantity: true, averageUnitCost: true },
    });

    const inventory = existing
      ? await tx.inventory.update({
          where: { id: existing.id },
          data: {
            quantity: { increment: quantity },
            averageUnitCost: Math.round(
              ((existing.quantity * Number(existing.averageUnitCost) +
                quantity * unitCost) /
                (existing.quantity + quantity)) *
                100
            ) / 100,
          },
          select: inventorySelect,
        })
      : await tx.inventory.create({
          data: {
            productId,
            siteId,
            companyId,
            quantity,
            averageUnitCost: unitCost,
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
  const { productId, siteId, clientId, quantity, unitCost, reference, notes } =
    req.body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({
        where: {
          productId_siteId: { productId, siteId },
        },
        select: { id: true, quantity: true, companyId: true, averageUnitCost: true },
      });

      if (!inventory || inventory.companyId !== companyId) {
        throw new Error("INVENTORY_NOT_FOUND");
      }
      const client = await tx.client.findFirst({
        where: { id: clientId, companyId },
        select: { id: true },
      });
      if (!client) {
        throw new Error("CLIENT_NOT_FOUND");
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
          clientId,
          transactionType: "sale",
          quantityChange: -quantity,
          unitCost: unitCost ?? null,
          costBasisUnitCost: inventory.averageUnitCost,
          cogsAmount: Math.round(quantity * Number(inventory.averageUnitCost) * 100) / 100,
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
          .json({ error: "No inventory record found for this product/site." });
        return;
      }
      if (err.message === "INSUFFICIENT_STOCK") {
        res
          .status(400)
          .json({ error: "Insufficient stock for this sale." });
        return;
      }
      if (err.message === "CLIENT_NOT_FOUND") {
        res.status(404).json({ error: "Client not found in this company." });
        return;
      }
    }
    throw err;
  }
});

// ── POST /adjust — Manual stock adjustment or return ─────────────
router.post("/adjust", validateBody(adjustStockSchema), async (req, res) => {
  const companyId = param(req, "companyId");
  const employeeId = req.employee?.id ?? null;
  const { productId, siteId, quantity, transactionType, reason, notes } =
    req.body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({
        where: {
          productId_siteId: { productId, siteId },
        },
        select: { id: true, quantity: true, companyId: true, averageUnitCost: true },
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
          transactionType,
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
          .json({ error: "No inventory record found for this product/site." });
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

// ── POST /transfer — Move stock between sites ────────────────────
router.post(
  "/transfer",
  validateBody(transferStockSchema),
  async (req, res) => {
    const companyId = param(req, "companyId");
    const employeeId = req.employee?.id ?? null;
    const { productId, fromSiteId, toSiteId, quantity, notes } =
      req.body;

    try {
      const result = await prisma.$transaction(async (tx) => {
        const source = await tx.inventory.findUnique({
          where: {
            productId_siteId: {
              productId,
              siteId: fromSiteId,
            },
          },
          select: { id: true, quantity: true, companyId: true, averageUnitCost: true },
        });

        if (!source || source.companyId !== companyId) {
          throw new Error("SOURCE_NOT_FOUND");
        }
        if (source.quantity < quantity) {
          throw new Error("INSUFFICIENT_STOCK");
        }

        const toSite = await tx.site.findFirst({
          where: { id: toSiteId, companyId },
          select: { id: true },
        });
        if (!toSite) {
          throw new Error("DEST_NOT_FOUND");
        }

        const updatedSource = await tx.inventory.update({
          where: { id: source.id },
          data: { quantity: { decrement: quantity } },
          select: inventorySelect,
        });

        const destExisting = await tx.inventory.findUnique({
          where: {
            productId_siteId: {
              productId,
              siteId: toSiteId,
            },
          },
          select: { id: true, quantity: true, averageUnitCost: true },
        });

        const destAverageUnitCost = destExisting
          ? Math.round(
              ((destExisting.quantity * Number(destExisting.averageUnitCost) +
                quantity * Number(source.averageUnitCost)) /
                (destExisting.quantity + quantity)) *
                100
            ) / 100
          : Number(source.averageUnitCost);

        const dest = destExisting
          ? await tx.inventory.update({
              where: { id: destExisting.id },
              data: {
                quantity: { increment: quantity },
                averageUnitCost: destAverageUnitCost,
              },
              select: inventorySelect,
            })
          : await tx.inventory.create({
              data: {
                productId,
                siteId: toSiteId,
                companyId,
                quantity,
                averageUnitCost: source.averageUnitCost,
              },
              select: inventorySelect,
            });

        const outTx = await tx.inventoryTransaction.create({
          data: {
            inventoryId: source.id,
            companyId,
            employeeId,
            transactionType: "transfer",
            quantityChange: -quantity,
            notes: notes ?? null,
          },
          select: transactionSelect,
        });

        const inTx = await tx.inventoryTransaction.create({
          data: {
            inventoryId: dest.id,
            companyId,
            employeeId,
            transactionType: "transfer",
            quantityChange: quantity,
            notes: notes ?? null,
          },
          select: transactionSelect,
        });

        return { from: updatedSource, to: dest, transactions: [outTx, inTx] };
      });

      res.status(201).json(result);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === "SOURCE_NOT_FOUND") {
          res.status(404).json({
            error:
              "No inventory record found for this product at the source site.",
          });
          return;
        }
        if (err.message === "INSUFFICIENT_STOCK") {
          res
            .status(400)
            .json({ error: "Insufficient stock at the source site." });
          return;
        }
        if (err.message === "DEST_NOT_FOUND") {
          res.status(404).json({
            error: "Destination site not found in this company.",
          });
          return;
        }
      }
      throw err;
    }
  }
);

/** GET / — List inventory for a company, optionally filtered by site */
router.get(
  "/",
  validateUUIDParams("companyId"),
  validateQuery(inventoryQuerySchema),
  async (req, res) => {
    const { siteId } = (req.validatedQuery ?? {}) as { siteId?: string };

    const where: { companyId: string; siteId?: string } = {
      companyId: param(req, "companyId"),
    };
    if (siteId) where.siteId = siteId;

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
        site: {
          select: {
            id: true,
            address: true,
            siteType: true,
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
        site: {
          select: {
            id: true,
            address: true,
            siteType: true,
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
