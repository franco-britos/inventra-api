import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export interface AccessTokenPayload {
  userId: string;
  email: string;
}

export interface RefreshTokenPayload {
  userId: string;
}

export interface MfaTokenPayload {
  userId: string;
  email: string;
  mfa: true;
}

export interface ReauthTokenPayload {
  userId: string;
  reauth: true;
}

/** Sign a short-lived access token */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"],
  });
}

/** Sign a longer-lived refresh token */
export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"],
  });
}

/** Sign a short-lived MFA challenge token (5 min) */
export function signMfaToken(payload: { userId: string; email: string }): string {
  return jwt.sign({ ...payload, mfa: true }, env.JWT_ACCESS_SECRET, {
    expiresIn: "5m",
  });
}

/** Sign a short-lived re-auth token (10 min) */
export function signReauthToken(payload: { userId: string }): string {
  return jwt.sign({ ...payload, reauth: true }, env.JWT_ACCESS_SECRET, {
    expiresIn: "10m",
  });
}

/** Verify and decode an access token */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

/** Verify and decode a refresh token */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}

/** Verify and decode an MFA challenge token, asserting the mfa claim */
export function verifyMfaToken(token: string): MfaTokenPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as Record<string, unknown>;
  if (payload.mfa !== true) {
    throw new jwt.JsonWebTokenError("Not an MFA token");
  }
  return payload as unknown as MfaTokenPayload;
}

/** Verify and decode a re-auth token, asserting the reauth claim */
export function verifyReauthToken(token: string): ReauthTokenPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as Record<string, unknown>;
  if (payload.reauth !== true) {
    throw new jwt.JsonWebTokenError("Not a re-auth token");
  }
  return payload as unknown as ReauthTokenPayload;
}
