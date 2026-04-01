import { z } from "zod";

export const createProductSchema = z.object({
  productName: z
    .string()
    .min(1, "Product name is required.")
    .max(255, "Product name is too long."),
  sku: z
    .string()
    .min(1, "SKU is required.")
    .max(100, "SKU is too long."),
  price: z
    .number()
    .nonnegative("Price must be zero or positive.")
    .multipleOf(0.01, "Price can have at most 2 decimal places."),
  description: z.string().max(2000, "Description is too long.").optional(),
  lowStockThreshold: z
    .number()
    .int("Threshold must be a whole number.")
    .min(0, "Threshold must be zero or positive.")
    .max(99999, "Threshold cannot exceed 99 999.")
    .optional(),
});

export const updateProductSchema = createProductSchema
  .partial()
  .extend({
    archivedAt: z
      .string()
      .datetime("archivedAt must be a valid ISO date.")
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });
