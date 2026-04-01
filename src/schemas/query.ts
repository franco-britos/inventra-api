import { z } from "zod";
import { uuid, paginationQuery } from "./common";

/** GET /inventory query params */
export const inventoryQuerySchema = z.object({
  siteId: uuid.optional(),
});

/** GET /transactions query params */
export const transactionsQuerySchema = paginationQuery.extend({
  inventoryId: uuid.optional(),
  employeeId: uuid.optional(),
  type: z
    .enum(["sale", "purchase", "adjustment", "return", "transfer"])
    .optional(),
});

// ── Report schemas ───────────────────────────────────────────────

/** GET /reports/stock-by-site */
export const stockBySiteQuerySchema = z.object({
  siteId: uuid.optional(),
});

/** GET /reports/transactions */
export const transactionHistoryQuerySchema = paginationQuery.extend({
  transactionId: uuid.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  type: z
    .enum(["sale", "purchase", "adjustment", "return", "transfer"])
    .optional(),
  employeeId: uuid.optional(),
  productId: uuid.optional(),
  productName: z.string().trim().min(1).max(255).optional(),
  siteId: uuid.optional(),
});

/** GET /reports/low-stock */
export const lowStockQuerySchema = z.object({
  threshold: z.coerce.number().int().min(0).optional(),
  siteId: uuid.optional(),
});
