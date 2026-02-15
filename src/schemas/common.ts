import { z } from "zod";

/** Reusable UUID schema */
export const uuid = z.string().uuid("Must be a valid UUID.");

/** Pagination: optional limit with a sensible max */
export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
