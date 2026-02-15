import { z } from "zod";

export const createInviteSchema = z.object({
  email: z.string().email("Invalid email address."),
  role: z.enum(["manager", "staff"], {
    message: "Role must be 'manager' or 'staff'.",
  }),
  firstName: z
    .string()
    .min(1, "First name is required.")
    .max(100, "First name is too long."),
  lastName: z
    .string()
    .min(1, "Last name is required.")
    .max(100, "Last name is too long."),
});
