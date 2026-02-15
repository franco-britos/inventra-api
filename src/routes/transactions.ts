import { Router } from "express";
import { prisma } from "../lib/prisma";
import { validateUUIDParams, validateQuery, param } from "../middleware/validate";
import { transactionsQuerySchema } from "../schemas/query";

/** Mounted at /companies/:companyId/transactions */
const router = Router({ mergeParams: true });

/** GET / — List transactions for a company, with optional filters */
router.get(
  "/",
  validateUUIDParams("companyId"),
  validateQuery(transactionsQuerySchema),
  async (req, res) => {
    const { inventoryId, employeeId, type, limit } = (req.validatedQuery ?? {}) as {
      inventoryId?: string;
      employeeId?: string;
      type?: string;
      limit: number;
    };

    const where: Record<string, unknown> = {
      companyId: param(req, "companyId"),
    };
    if (inventoryId) where.inventoryId = inventoryId;
    if (employeeId) where.employeeId = employeeId;
    if (type) where.transactionType = type;

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
            id: true,
            product: {
              select: { id: true, productName: true, sku: true },
            },
            location: {
              select: { id: true, address: true },
            },
          },
        },
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    res.json(transactions);
  }
);

/** GET /:transactionId — Get a single transaction */
router.get(
  "/:transactionId",
  validateUUIDParams("companyId", "transactionId"),
  async (req, res) => {
    const transaction = await prisma.inventoryTransaction.findFirst({
      where: {
        id: param(req, "transactionId"),
        companyId: param(req, "companyId"),
      },
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
            id: true,
            quantity: true,
            product: {
              select: { id: true, productName: true, sku: true, price: true },
            },
            location: {
              select: { id: true, address: true, locationType: true },
            },
          },
        },
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    res.json(transaction);
  }
);

export default router;
