import { z } from "zod";

/** Single site payload — reused in both standalone and company-creation flows */
export const sitePayload = z.object({
  address: z.string().max(500, "Address is too long.").optional(),
  unit: z.string().max(50, "Unit/suite is too long.").optional(),
  city: z.string().max(100, "City is too long.").optional(),
  state: z.string().max(100, "State is too long.").optional(),
  zipCode: z.string().max(20, "Zip code is too long.").optional(),
  country: z.string().max(100, "Country is too long.").optional(),
  placeId: z.string().max(255, "Place ID is too long.").optional(),
  vin: z
    .preprocess(
      (value) => (typeof value === "string" ? value : undefined),
      z.string().max(50, "VIN is too long.").optional()
    )
    .optional(),
  driverName: z.string().max(100, "Driver name is too long.").optional(),
  licensePlate: z.string().max(30, "License plate is too long.").optional(),
  shortDescription: z
    .string()
    .max(255, "Short description is too long.")
    .optional(),
  siteType: z.enum(["warehouse", "store", "vehicle"], {
    message: "Site type must be 'warehouse', 'store', or 'vehicle'.",
  }),
}).superRefine((data, ctx) => {
  if (data.siteType !== "vehicle" && !data.address?.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["address"],
      message: "Address is required.",
    });
  }
  if (data.siteType === "vehicle" && !data.vin?.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["vin"],
      message: "VIN is required for vehicle sites.",
    });
  }
});

/** POST /companies/:companyId/sites */
export const createSiteSchema = sitePayload;

/** Array variant for the company-creation flow (optional, 1+ if provided) */
export const sitesArraySchema = z
  .array(sitePayload)
  .min(1, "At least one site is required when sites are provided.");
