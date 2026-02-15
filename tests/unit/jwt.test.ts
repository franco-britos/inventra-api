import { describe, it, expect } from "vitest";
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../../src/lib/jwt";

describe("JWT utilities", () => {
  const accessPayload = { userId: "user-123", email: "test@example.com" };
  const refreshPayload = { userId: "user-123" };

  it("signs and verifies an access token", () => {
    const token = signAccessToken(accessPayload);
    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe(accessPayload.userId);
    expect(decoded.email).toBe(accessPayload.email);
  });

  it("signs and verifies a refresh token", () => {
    const token = signRefreshToken(refreshPayload);
    const decoded = verifyRefreshToken(token);
    expect(decoded.userId).toBe(refreshPayload.userId);
  });

  it("rejects an access token verified with the refresh secret", () => {
    const token = signAccessToken(accessPayload);
    expect(() => verifyRefreshToken(token)).toThrow();
  });

  it("rejects a refresh token verified with the access secret", () => {
    const token = signRefreshToken(refreshPayload);
    expect(() => verifyAccessToken(token)).toThrow();
  });

  it("rejects a tampered token", () => {
    const token = signAccessToken(accessPayload);
    const tampered = token.slice(0, -4) + "XXXX";
    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it("rejects a garbage string", () => {
    expect(() => verifyAccessToken("not.a.token")).toThrow();
  });
});
