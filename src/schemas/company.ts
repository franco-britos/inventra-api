import { z } from "zod";
import { locationPayload } from "./location";

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
  jobTitle: z.string().max(100, "Job title is too long.").optional(),
  /** Optional initial locations to create alongside the company */
  locations: z
    .array(locationPayload)
    .min(1, "At least one location is required when locations are provided.")
    .optional(),
});
