import { describe, it, expect } from "vitest";
import { registerSchema, loginSchema, refreshSchema } from "../../src/schemas/auth";
import { createCompanySchema } from "../../src/schemas/company";
import { createProductSchema } from "../../src/schemas/product";
import { createInviteSchema } from "../../src/schemas/invite";
import {
  receiveStockSchema,
  sellStockSchema,
  adjustStockSchema,
} from "../../src/schemas/inventory";

// ── Auth schemas ─────────────────────────────────────────────────

describe("registerSchema", () => {
  it("accepts valid email and password", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "securepass",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = registerSchema.safeParse({
      email: "not-an-email",
      password: "securepass",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short password", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    const result = registerSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "x",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("refreshSchema", () => {
  it("accepts a token string", () => {
    const result = refreshSchema.safeParse({ refreshToken: "abc123" });
    expect(result.success).toBe(true);
  });

  it("rejects missing token", () => {
    const result = refreshSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ── Company schema ───────────────────────────────────────────────

describe("createCompanySchema", () => {
  it("accepts valid company data", () => {
    const result = createCompanySchema.safeParse({
      companyName: "Acme Inc",
      firstName: "Jane",
      lastName: "Doe",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional jobTitle", () => {
    const result = createCompanySchema.safeParse({
      companyName: "Acme Inc",
      firstName: "Jane",
      lastName: "Doe",
      jobTitle: "CEO",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.jobTitle).toBe("CEO");
    }
  });

  it("rejects empty company name", () => {
    const result = createCompanySchema.safeParse({
      companyName: "",
      firstName: "Jane",
      lastName: "Doe",
    });
    expect(result.success).toBe(false);
  });
});

// ── Product schema ───────────────────────────────────────────────

describe("createProductSchema", () => {
  it("accepts valid product", () => {
    const result = createProductSchema.safeParse({
      productName: "Widget",
      sku: "WDG-001",
      price: 29.99,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative price", () => {
    const result = createProductSchema.safeParse({
      productName: "Widget",
      sku: "WDG-001",
      price: -5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects price with too many decimals", () => {
    const result = createProductSchema.safeParse({
      productName: "Widget",
      sku: "WDG-001",
      price: 1.999,
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional description", () => {
    const result = createProductSchema.safeParse({
      productName: "Widget",
      sku: "WDG-001",
      price: 10,
      description: "A fine widget",
    });
    expect(result.success).toBe(true);
  });
});

// ── Invite schema ────────────────────────────────────────────────

describe("createInviteSchema", () => {
  it("accepts manager role", () => {
    const result = createInviteSchema.safeParse({
      email: "mgr@test.com",
      role: "manager",
      firstName: "Bob",
      lastName: "Smith",
    });
    expect(result.success).toBe(true);
  });

  it("accepts staff role", () => {
    const result = createInviteSchema.safeParse({
      email: "staff@test.com",
      role: "staff",
      firstName: "Alice",
      lastName: "Jones",
    });
    expect(result.success).toBe(true);
  });

  it("rejects owner role (cannot invite owners)", () => {
    const result = createInviteSchema.safeParse({
      email: "boss@test.com",
      role: "owner",
      firstName: "Big",
      lastName: "Boss",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = createInviteSchema.safeParse({
      email: "not-email",
      role: "staff",
      firstName: "X",
      lastName: "Y",
    });
    expect(result.success).toBe(false);
  });
});

// ── Inventory schemas ────────────────────────────────────────────

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("receiveStockSchema", () => {
  it("accepts valid receive data", () => {
    const result = receiveStockSchema.safeParse({
      productId: VALID_UUID,
      locationId: VALID_UUID,
      quantity: 50,
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero quantity", () => {
    const result = receiveStockSchema.safeParse({
      productId: VALID_UUID,
      locationId: VALID_UUID,
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative quantity", () => {
    const result = receiveStockSchema.safeParse({
      productId: VALID_UUID,
      locationId: VALID_UUID,
      quantity: -5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID productId", () => {
    const result = receiveStockSchema.safeParse({
      productId: "not-a-uuid",
      locationId: VALID_UUID,
      quantity: 10,
    });
    expect(result.success).toBe(false);
  });
});

describe("sellStockSchema", () => {
  it("accepts valid sale data with optional fields", () => {
    const result = sellStockSchema.safeParse({
      productId: VALID_UUID,
      locationId: VALID_UUID,
      quantity: 10,
      unitCost: 5.99,
      reference: "INV-100",
      notes: "Customer order",
    });
    expect(result.success).toBe(true);
  });
});

describe("adjustStockSchema", () => {
  it("accepts positive adjustment", () => {
    const result = adjustStockSchema.safeParse({
      productId: VALID_UUID,
      locationId: VALID_UUID,
      quantity: 5,
    });
    expect(result.success).toBe(true);
  });

  it("accepts negative adjustment", () => {
    const result = adjustStockSchema.safeParse({
      productId: VALID_UUID,
      locationId: VALID_UUID,
      quantity: -3,
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero adjustment", () => {
    const result = adjustStockSchema.safeParse({
      productId: VALID_UUID,
      locationId: VALID_UUID,
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });
});
