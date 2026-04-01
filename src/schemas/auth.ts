import { z } from "zod";

/**
 * Industry-standard password policy (OWASP / NIST 800-63B aligned):
 * - Minimum 8 characters (NIST minimum)
 * - Maximum 128 characters (prevent bcrypt DoS — bcrypt truncates at 72 bytes)
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character
 */
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must not exceed 128 characters.")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
  .regex(/[0-9]/, "Password must contain at least one digit.")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must contain at least one special character."
  );

/** Email addresses are case-insensitive per RFC 5321 */
const emailSchema = z
  .string()
  .email("Invalid email address.")
  .transform((e) => e.toLowerCase());

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required."),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required."),
  password: passwordSchema,
});

export const reauthSchema = z.object({
  password: z.string().min(1, "Password is required."),
});
