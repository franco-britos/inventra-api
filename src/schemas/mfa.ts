import { z } from "zod";

export const mfaVerifySchema = z.object({
  mfaToken: z.string().min(1, "MFA token is required."),
  code: z.string().length(6, "Code must be 6 digits."),
  method: z.enum(["totp", "email"]),
});

export const mfaSendEmailCodeSchema = z.object({
  mfaToken: z.string().min(1, "MFA token is required."),
});

export const mfaCodeSchema = z.object({
  code: z.string().length(6, "Code must be 6 digits."),
});
