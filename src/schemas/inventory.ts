import { z } from "zod";
import { uuid } from "./common";

/** POST /inventory/receive -- receive stock (purchase) */
export const receiveStockSchema = z.object({
  productId: uuid,
  locationId: uuid,
  quantity: z
    .number()
    .int("Quantity must be a whole number.")
    .positive("Quantity must be greater than zero."),
  unitCost: z
    .number()
    .nonnegative("Unit cost must be zero or positive.")
    .multipleOf(0.01, "Unit cost can have at most 2 decimal places.")
    .optional(),
  reference: z.string().max(255, "Reference is too long.").optional(),
  notes: z.string().max(2000, "Notes are too long.").optional(),
});

/** POST /inventory/sale -- sell stock */
export const sellStockSchema = z.object({
  productId: uuid,
  locationId: uuid,
  quantity: z
    .number()
    .int("Quantity must be a whole number.")
    .positive("Quantity must be greater than zero."),
  unitCost: z
    .number()
    .nonnegative("Unit cost must be zero or positive.")
    .multipleOf(0.01, "Unit cost can have at most 2 decimal places.")
    .optional(),
  reference: z.string().max(255, "Reference is too long.").optional(),
  notes: z.string().max(2000, "Notes are too long.").optional(),
});

/** POST /inventory/adjust -- manual stock adjustment */
export const adjustStockSchema = z.object({
  productId: uuid,
  locationId: uuid,
  quantity: z
    .number()
    .int("Quantity must be a whole number.")
    .refine((v) => v !== 0, "Quantity cannot be zero."),
  reason: z.string().max(255, "Reason is too long.").optional(),
  notes: z.string().max(2000, "Notes are too long.").optional(),
});
