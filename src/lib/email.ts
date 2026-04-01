import { Resend } from "resend";
import { env } from "../config/env";

let resend: Resend | null = null;

function getResendClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!resend) resend = new Resend(env.RESEND_API_KEY);
  return resend;
}

const FROM_ADDRESS = "Inventra <onboarding@resend.dev>";

export async function sendPasswordResetEmail(
  to: string,
  token: string
): Promise<void> {
  const resetLink = `${env.APP_URL}/reset-password?token=${token}`;

  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
    console.log(`[Email] Password reset link for ${to}: ${resetLink}`);
  }

  const client = getResendClient();
  if (!client) {
    console.warn("[Email] RESEND_API_KEY not set — skipping email send.");
    return;
  }

  const { error } = await client.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: "Reset your Inventra password",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Reset your password</h2>
        <p>We received a request to reset your Inventra account password. Click the button below to choose a new password:</p>
        <a href="${resetLink}"
           style="display: inline-block; padding: 12px 24px; background-color: #171717; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 500;">
          Reset password
        </a>
        <p style="margin-top: 24px; font-size: 14px; color: #666;">
          This link expires in 10 minutes. If you didn't request a password reset, you can safely ignore this email.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[Email] Failed to send password reset email:", error);
    throw new Error("Failed to send password reset email.");
  }
}

export async function sendMfaEmailCode(
  to: string,
  code: string
): Promise<void> {
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") {
    console.log(`[Email] MFA code for ${to}: ${code}`);
  }

  const client = getResendClient();
  if (!client) {
    console.warn("[Email] RESEND_API_KEY not set — skipping email send.");
    return;
  }

  const { error } = await client.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: "Your Inventra verification code",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Verification code</h2>
        <p>Use the code below to complete your sign-in:</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; text-align: center; padding: 16px 0;">
          ${code}
        </div>
        <p style="margin-top: 24px; font-size: 14px; color: #666;">
          This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[Email] Failed to send MFA email code:", error);
    throw new Error("Failed to send MFA email code.");
  }
}
