import { z } from "zod";

const productId = z.string().uuid("Please select a product.");
const siteId = z.string().uuid("Please select a site.");
const clientId = z.string().uuid("Please select a client.");

/** POST /inventory/receive -- receive stock (purchase) */
export const receiveStockSchema = z.object({
  productId,
  siteId,
  quantity: z
    .number()
    .int("Quantity must be a whole number.")
    .positive("Quantity must be greater than zero."),
  unitCost: z
    .number({ message: "Unit cost is required when receiving stock." })
    .nonnegative("Unit cost must be zero or positive.")
    .multipleOf(0.01, "Unit cost can have at most 2 decimal places."),
  reference: z.string().max(255, "Reference is too long.").optional(),
  notes: z.string().max(2000, "Notes are too long.").optional(),
});

/** POST /inventory/sale -- sell stock */
export const sellStockSchema = z.object({
  productId,
  siteId,
  clientId,
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
  productId,
  siteId,
  quantity: z
    .number()
    .int("Quantity must be a whole number.")
    .refine((v) => v !== 0, "Quantity cannot be zero."),
  transactionType: z.enum(["adjustment", "return"], {
    message: "Please select a transaction type.",
  }),
  reason: z.string().max(255, "Reason is too long.").optional(),
  notes: z.string().max(2000, "Notes are too long.").optional(),
});

/** POST /inventory/transfer -- move stock between sites */
export const transferStockSchema = z
  .object({
    productId,
    fromSiteId: z.string().uuid("Please select a source site."),
    toSiteId: z.string().uuid("Please select a destination site."),
    quantity: z
      .number()
      .int("Quantity must be a whole number.")
      .positive("Quantity must be greater than zero."),
    notes: z.string().max(2000, "Notes are too long.").optional(),
  })
  .refine((d) => d.fromSiteId !== d.toSiteId, {
    message: "Source and destination must be different sites.",
    path: ["toSiteId"],
  });
