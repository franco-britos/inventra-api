import { z } from "zod";
import { paginationQuery } from "./common";

export const createClientSchema = z.object({
  businessName: z.string().trim().min(1, "Business name is required.").max(255),
  businessStoreId: z
    .string()
    .trim()
    .min(1, "Business/store ID is required.")
    .max(100),
  address: z.string().trim().min(1, "Address is required.").max(500),
  pointOfContactName: z
    .string()
    .trim()
    .min(1, "Point of contact full name is required.")
    .max(255),
  phoneNumber: z.string().trim().min(1, "Phone number is required.").max(50),
  email: z.string().trim().email("Please enter a valid email address."),
  preferredPaymentMethod: z.enum(["cash", "card", "money_order"], {
    message: "Preferred payment method must be cash, card, or money order.",
  }),
  paymentPreference: z
    .string()
    .trim()
    .min(1, "Payment preference is required.")
    .max(255),
});

export const updateClientSchema = createClientSchema.partial().extend({
  archivedAt: z.coerce.date().nullable().optional(),
});

export const clientsQuerySchema = z.object({
  businessStoreId: z.string().trim().min(1).max(100).optional(),
  archived: z
    .preprocess((value) => {
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true" || normalized === "1") return true;
        if (normalized === "false" || normalized === "0" || normalized === "") return false;
      }
      return value;
    }, z.boolean())
    .optional(),
});

export const paginatedClientsQuerySchema = paginationQuery.extend({
  page: z.coerce.number().int().min(1).default(1),
  q: z.string().trim().min(1).max(255).optional(),
  businessStoreId: z.string().trim().min(1).max(100).optional(),
  archived: z
    .preprocess((value) => {
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true" || normalized === "1") return true;
        if (normalized === "false" || normalized === "0" || normalized === "") return false;
      }
      return value;
    }, z.boolean())
    .optional(),
});
