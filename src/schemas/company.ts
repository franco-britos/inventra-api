import { z } from "zod";
import { sitePayload } from "./site";

export const createCompanySchema = z.object({
  companyName: z
    .string()
    .min(1, "Company name is required.")
    .max(255, "Company name is too long."),
  firstName: z
    .string()
    .min(1, "First name is required.")
    .max(100, "First name is too long."),
  lastName: z
    .string()
    .min(1, "Last name is required.")
    .max(100, "Last name is too long."),
  /** Optional initial sites to create alongside the company */
  sites: z
    .array(sitePayload)
    .min(1, "At least one site is required when sites are provided.")
    .optional(),
});
