import "dotenv/config";
import { PrismaClient, Prisma } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...\n");

  // ── Clean existing data (in dependency order) ──
  await prisma.inventoryTransaction.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.location.deleteMany();
  await prisma.appUser.deleteMany();
  await prisma.company.deleteMany();

  console.log("  Cleared existing data.");

  // ── Companies ──
  const acmeCorp = await prisma.company.create({
    data: { companyName: "Acme Corp" },
  });

  const globalTrading = await prisma.company.create({
    data: { companyName: "Global Trading Co." },
  });

  console.log(`  Created ${2} companies.`);

  // ── App Users ──
  const users = await Promise.all([
    prisma.appUser.create({
      data: {
        email: "alice@acme.com",
        passwordHash: "$2b$10$placeholder_hash_alice",
        emailVerified: true,
      },
    }),
    prisma.appUser.create({
      data: {
        email: "bob@acme.com",
        passwordHash: "$2b$10$placeholder_hash_bob",
        emailVerified: true,
      },
    }),
    prisma.appUser.create({
      data: {
        email: "carol@globaltrade.com",
        passwordHash: "$2b$10$placeholder_hash_carol",
        emailVerified: true,
      },
    }),
    prisma.appUser.create({
      data: {
        email: "dave@globaltrade.com",
        passwordHash: "$2b$10$placeholder_hash_dave",
        emailVerified: false,
      },
    }),
  ]);

  const [alice, bob, carol, dave] = users;

  console.log(`  Created ${users.length} users.`);

  // ── Locations ──
  const acmeWarehouse = await prisma.location.create({
    data: {
      companyId: acmeCorp.id,
      address: "100 Industrial Blvd, Austin, TX 78701",
      locationType: "warehouse",
    },
  });

  const acmeStore = await prisma.location.create({
    data: {
      companyId: acmeCorp.id,
      address: "250 Main St, Austin, TX 78702",
      locationType: "store",
    },
  });

  const globalWarehouse = await prisma.location.create({
    data: {
      companyId: globalTrading.id,
      address: "500 Commerce Dr, Miami, FL 33101",
      locationType: "warehouse",
    },
  });

  const globalStore = await prisma.location.create({
    data: {
      companyId: globalTrading.id,
      address: "88 Ocean Ave, Miami, FL 33139",
      locationType: "store",
    },
  });

  console.log(`  Created ${4} locations.`);

  // ── Employees ──
  const aliceEmployee = await prisma.employee.create({
    data: {
      userId: alice.id,
      companyId: acmeCorp.id,
      locationId: acmeWarehouse.id,
      firstName: "Alice",
      lastName: "Johnson",
      jobTitle: "Warehouse Manager",
    },
  });

  const bobEmployee = await prisma.employee.create({
    data: {
      userId: bob.id,
      companyId: acmeCorp.id,
      locationId: acmeStore.id,
      firstName: "Bob",
      lastName: "Smith",
      jobTitle: "Store Associate",
    },
  });

  const carolEmployee = await prisma.employee.create({
    data: {
      userId: carol.id,
      companyId: globalTrading.id,
      locationId: globalWarehouse.id,
      firstName: "Carol",
      lastName: "Martinez",
      jobTitle: "Operations Lead",
    },
  });

  const daveEmployee = await prisma.employee.create({
    data: {
      userId: dave.id,
      companyId: globalTrading.id,
      locationId: globalStore.id,
      firstName: "Dave",
      lastName: "Lee",
      jobTitle: "Sales Associate",
    },
  });

  console.log(`  Created ${4} employees.`);

  // ── Products (Acme Corp) ──
  const acmeProducts = await Promise.all([
    prisma.product.create({
      data: {
        companyId: acmeCorp.id,
        productName: "Widget A",
        sku: "ACM-WA-001",
        price: new Prisma.Decimal("19.99"),
        description: "Standard widget for general use.",
      },
    }),
    prisma.product.create({
      data: {
        companyId: acmeCorp.id,
        productName: "Widget B",
        sku: "ACM-WB-002",
        price: new Prisma.Decimal("34.50"),
        description: "Premium widget with extended durability.",
      },
    }),
    prisma.product.create({
      data: {
        companyId: acmeCorp.id,
        productName: "Gadget Pro",
        sku: "ACM-GP-003",
        price: new Prisma.Decimal("89.00"),
        description: "High-performance gadget for professional use.",
      },
    }),
  ]);

  // ── Products (Global Trading) ──
  const globalProducts = await Promise.all([
    prisma.product.create({
      data: {
        companyId: globalTrading.id,
        productName: "Cable Kit",
        sku: "GLB-CK-001",
        price: new Prisma.Decimal("12.75"),
        description: "Assorted cable pack with adapters.",
      },
    }),
    prisma.product.create({
      data: {
        companyId: globalTrading.id,
        productName: "Power Supply Unit",
        sku: "GLB-PS-002",
        price: new Prisma.Decimal("54.99"),
        description: "500W power supply unit.",
      },
    }),
  ]);

  const allProducts = [...acmeProducts, ...globalProducts];
  console.log(`  Created ${allProducts.length} products.`);

  // ── Inventory (stock at each location) ──
  const inventories = await Promise.all([
    // Acme warehouse stock
    prisma.inventory.create({
      data: {
        productId: acmeProducts[0].id,
        locationId: acmeWarehouse.id,
        companyId: acmeCorp.id,
        quantity: 500,
      },
    }),
    prisma.inventory.create({
      data: {
        productId: acmeProducts[1].id,
        locationId: acmeWarehouse.id,
        companyId: acmeCorp.id,
        quantity: 200,
      },
    }),
    prisma.inventory.create({
      data: {
        productId: acmeProducts[2].id,
        locationId: acmeWarehouse.id,
        companyId: acmeCorp.id,
        quantity: 75,
      },
    }),
    // Acme store stock
    prisma.inventory.create({
      data: {
        productId: acmeProducts[0].id,
        locationId: acmeStore.id,
        companyId: acmeCorp.id,
        quantity: 50,
      },
    }),
    prisma.inventory.create({
      data: {
        productId: acmeProducts[1].id,
        locationId: acmeStore.id,
        companyId: acmeCorp.id,
        quantity: 30,
      },
    }),
    // Global warehouse stock
    prisma.inventory.create({
      data: {
        productId: globalProducts[0].id,
        locationId: globalWarehouse.id,
        companyId: globalTrading.id,
        quantity: 1000,
      },
    }),
    prisma.inventory.create({
      data: {
        productId: globalProducts[1].id,
        locationId: globalWarehouse.id,
        companyId: globalTrading.id,
        quantity: 150,
      },
    }),
    // Global store stock
    prisma.inventory.create({
      data: {
        productId: globalProducts[0].id,
        locationId: globalStore.id,
        companyId: globalTrading.id,
        quantity: 120,
      },
    }),
  ]);

  console.log(`  Created ${inventories.length} inventory records.`);

  // ── Inventory Transactions ──
  const transactions = await Promise.all([
    // Initial stock purchase for Acme warehouse
    prisma.inventoryTransaction.create({
      data: {
        inventoryId: inventories[0].id,
        companyId: acmeCorp.id,
        employeeId: aliceEmployee.id,
        transactionType: "purchase",
        quantityChange: 500,
        unitCost: new Prisma.Decimal("10.00"),
        reference: "PO-2026-001",
        notes: "Initial stock purchase from supplier.",
      },
    }),
    prisma.inventoryTransaction.create({
      data: {
        inventoryId: inventories[1].id,
        companyId: acmeCorp.id,
        employeeId: aliceEmployee.id,
        transactionType: "purchase",
        quantityChange: 200,
        unitCost: new Prisma.Decimal("18.00"),
        reference: "PO-2026-002",
        notes: "Initial stock purchase from supplier.",
      },
    }),
    // Transfer from Acme warehouse to store
    prisma.inventoryTransaction.create({
      data: {
        inventoryId: inventories[0].id,
        companyId: acmeCorp.id,
        employeeId: aliceEmployee.id,
        transactionType: "transfer",
        quantityChange: -50,
        reference: "TR-2026-001",
        notes: "Transfer to Main St store.",
      },
    }),
    prisma.inventoryTransaction.create({
      data: {
        inventoryId: inventories[3].id,
        companyId: acmeCorp.id,
        employeeId: bobEmployee.id,
        transactionType: "transfer",
        quantityChange: 50,
        reference: "TR-2026-001",
        notes: "Received from warehouse.",
      },
    }),
    // Sale at Acme store
    prisma.inventoryTransaction.create({
      data: {
        inventoryId: inventories[3].id,
        companyId: acmeCorp.id,
        employeeId: bobEmployee.id,
        transactionType: "sale",
        quantityChange: -5,
        unitCost: new Prisma.Decimal("19.99"),
        reference: "INV-2026-0001",
        notes: "Walk-in customer sale.",
      },
    }),
    // Adjustment at Acme warehouse
    prisma.inventoryTransaction.create({
      data: {
        inventoryId: inventories[2].id,
        companyId: acmeCorp.id,
        employeeId: aliceEmployee.id,
        transactionType: "adjustment",
        quantityChange: -3,
        notes: "Damaged items written off during audit.",
      },
    }),
    // Global Trading purchase
    prisma.inventoryTransaction.create({
      data: {
        inventoryId: inventories[5].id,
        companyId: globalTrading.id,
        employeeId: carolEmployee.id,
        transactionType: "purchase",
        quantityChange: 1000,
        unitCost: new Prisma.Decimal("6.50"),
        reference: "PO-GLB-001",
        notes: "Bulk cable kit order.",
      },
    }),
    // Global Trading sale
    prisma.inventoryTransaction.create({
      data: {
        inventoryId: inventories[7].id,
        companyId: globalTrading.id,
        employeeId: daveEmployee.id,
        transactionType: "sale",
        quantityChange: -15,
        unitCost: new Prisma.Decimal("12.75"),
        reference: "INV-GLB-0001",
        notes: "B2B order for local retailer.",
      },
    }),
    // Return at Global Trading store
    prisma.inventoryTransaction.create({
      data: {
        inventoryId: inventories[7].id,
        companyId: globalTrading.id,
        employeeId: daveEmployee.id,
        transactionType: "return",
        quantityChange: 3,
        unitCost: new Prisma.Decimal("12.75"),
        reference: "RET-GLB-0001",
        notes: "Defective units returned by customer.",
      },
    }),
  ]);

  console.log(`  Created ${transactions.length} inventory transactions.`);

  console.log("\n✅ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
