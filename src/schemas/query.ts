import { z } from "zod";
import { uuid, paginationQuery } from "./common";

/** GET /inventory query params */
export const inventoryQuerySchema = z.object({
  locationId: uuid.optional(),
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

/** GET /reports/stock-by-location */
export const stockByLocationQuerySchema = z.object({
  locationId: uuid.optional(),
});

/** GET /reports/transactions */
export const transactionHistoryQuerySchema = paginationQuery.extend({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  type: z
    .enum(["sale", "purchase", "adjustment", "return", "transfer"])
    .optional(),
  employeeId: uuid.optional(),
  productId: uuid.optional(),
});

/** GET /reports/low-stock */
export const lowStockQuerySchema = z.object({
  threshold: z.coerce.number().int().min(0).default(10),
  locationId: uuid.optional(),
});
