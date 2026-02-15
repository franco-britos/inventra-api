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
});
