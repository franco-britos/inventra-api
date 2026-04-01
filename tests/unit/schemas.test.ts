import { describe, it, expect } from "vitest";
import { registerSchema, loginSchema, refreshSchema } from "../../src/schemas/auth";
import { createCompanySchema } from "../../src/schemas/company";
import { createProductSchema } from "../../src/schemas/product";
import { createInviteSchema } from "../../src/schemas/invite";
import { createSiteSchema } from "../../src/schemas/site";
import {
  receiveStockSchema,
  sellStockSchema,
  adjustStockSchema,
} from "../../src/schemas/inventory";

// ── Auth schemas ─────────────────────────────────────────────────

describe("registerSchema", () => {
  it("accepts valid email and strong password", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "Str0ng!pass",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = registerSchema.safeParse({
      email: "not-an-email",
      password: "Str0ng!pass",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short password", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "Ab1!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password without uppercase", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "nouppercase1!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password without lowercase", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "NOLOWERCASE1!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password without digit", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "NoDigitHere!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password without special character", () => {
    const result = registerSchema.safeParse({
      email: "user@example.com",
      password: "NoSpecial1here",
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

  it("accepts optional lowStockThreshold", () => {
    const result = createProductSchema.safeParse({
      productName: "Widget",
      sku: "WDG-001",
      price: 10,
      lowStockThreshold: 25,
    });
    expect(result.success).toBe(true);
  });

  it("rejects lowStockThreshold above 99999", () => {
    const result = createProductSchema.safeParse({
      productName: "Widget",
      sku: "WDG-001",
      price: 10,
      lowStockThreshold: 100000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative lowStockThreshold", () => {
    const result = createProductSchema.safeParse({
      productName: "Widget",
      sku: "WDG-001",
      price: 10,
      lowStockThreshold: -1,
    });
    expect(result.success).toBe(false);
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
      siteId: VALID_UUID,
      quantity: 50,
      unitCost: 9.99,
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero quantity", () => {
    const result = receiveStockSchema.safeParse({
      productId: VALID_UUID,
      siteId: VALID_UUID,
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative quantity", () => {
    const result = receiveStockSchema.safeParse({
      productId: VALID_UUID,
      siteId: VALID_UUID,
      quantity: -5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID productId", () => {
    const result = receiveStockSchema.safeParse({
      productId: "not-a-uuid",
      siteId: VALID_UUID,
      quantity: 10,
    });
    expect(result.success).toBe(false);
  });
});

describe("sellStockSchema", () => {
  it("accepts valid sale data with optional fields", () => {
    const result = sellStockSchema.safeParse({
      productId: VALID_UUID,
      siteId: VALID_UUID,
      clientId: VALID_UUID,
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
      siteId: VALID_UUID,
      quantity: 5,
      transactionType: "adjustment",
    });
    expect(result.success).toBe(true);
  });

  it("accepts negative adjustment", () => {
    const result = adjustStockSchema.safeParse({
      productId: VALID_UUID,
      siteId: VALID_UUID,
      quantity: -3,
      transactionType: "adjustment",
    });
    expect(result.success).toBe(true);
  });

  it("accepts return type", () => {
    const result = adjustStockSchema.safeParse({
      productId: VALID_UUID,
      siteId: VALID_UUID,
      quantity: 2,
      transactionType: "return",
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero adjustment", () => {
    const result = adjustStockSchema.safeParse({
      productId: VALID_UUID,
      siteId: VALID_UUID,
      quantity: 0,
      transactionType: "adjustment",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing transactionType", () => {
    const result = adjustStockSchema.safeParse({
      productId: VALID_UUID,
      siteId: VALID_UUID,
      quantity: 5,
    });
    expect(result.success).toBe(false);
  });
});

// ── Site schema ─────────────────────────────────────────────────

describe("createSiteSchema", () => {
  it("accepts minimal site (address + type only)", () => {
    const result = createSiteSchema.safeParse({
      address: "123 Main St",
      siteType: "warehouse",
    });
    expect(result.success).toBe(true);
  });

  it("accepts site with all structured address fields", () => {
    const result = createSiteSchema.safeParse({
      address: "456 Market St",
      unit: "Suite 200",
      city: "San Francisco",
      state: "CA",
      zipCode: "94105",
      country: "US",
      placeId: "ChIJ_xyz789",
      siteType: "store",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.unit).toBe("Suite 200");
      expect(result.data.city).toBe("San Francisco");
      expect(result.data.state).toBe("CA");
      expect(result.data.zipCode).toBe("94105");
      expect(result.data.country).toBe("US");
      expect(result.data.placeId).toBe("ChIJ_xyz789");
    }
  });

  it("accepts vehicle site when VIN is provided", () => {
    const result = createSiteSchema.safeParse({
      siteType: "vehicle",
      vin: "1HGCM82633A123456",
      licensePlate: "ABC-1234",
      shortDescription: "Night shift vehicle",
    });
    expect(result.success).toBe(true);
  });

  it("rejects vehicle site without VIN", () => {
    const result = createSiteSchema.safeParse({
      siteType: "vehicle",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.vin?.[0]).toBe(
        "VIN is required for vehicle sites."
      );
    }
  });

  it("requires address for non-vehicle sites", () => {
    const result = createSiteSchema.safeParse({
      siteType: "warehouse",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty address", () => {
    const result = createSiteSchema.safeParse({
      address: "",
      siteType: "warehouse",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid site type", () => {
    const result = createSiteSchema.safeParse({
      address: "123 Main St",
      siteType: "garage",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unit exceeding max length", () => {
    const result = createSiteSchema.safeParse({
      address: "123 Main St",
      unit: "A".repeat(51),
      siteType: "warehouse",
    });
    expect(result.success).toBe(false);
  });

  it("rejects city exceeding max length", () => {
    const result = createSiteSchema.safeParse({
      address: "123 Main St",
      city: "A".repeat(101),
      siteType: "warehouse",
    });
    expect(result.success).toBe(false);
  });

  it("rejects zipCode exceeding max length", () => {
    const result = createSiteSchema.safeParse({
      address: "123 Main St",
      zipCode: "1".repeat(21),
      siteType: "warehouse",
    });
    expect(result.success).toBe(false);
  });

  it("structured fields are optional (undefined is fine)", () => {
    const result = createSiteSchema.safeParse({
      address: "123 Main St",
      siteType: "store",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.unit).toBeUndefined();
      expect(result.data.city).toBeUndefined();
      expect(result.data.state).toBeUndefined();
      expect(result.data.zipCode).toBeUndefined();
      expect(result.data.country).toBeUndefined();
      expect(result.data.placeId).toBeUndefined();
    }
  });
});
