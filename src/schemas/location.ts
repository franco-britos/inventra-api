import { z } from "zod";

/** Single location payload — reused in both standalone and company-creation flows */
export const locationPayload = z.object({
  address: z
    .string()
    .min(1, "Address is required.")
    .max(500, "Address is too long."),
  locationType: z.enum(["warehouse", "store"], {
    message: "Location type must be 'warehouse' or 'store'.",
  }),
});

/** POST /companies/:companyId/locations */
export const createLocationSchema = locationPayload;

/** Array variant for the company-creation flow (optional, 1+ if provided) */
export const locationsArraySchema = z
  .array(locationPayload)
  .min(1, "At least one location is required when locations are provided.");
