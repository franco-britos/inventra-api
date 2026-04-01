import { beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "../../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../../src/config/env";
import { resetUserCounter } from "./auth";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
export const testPrisma = new PrismaClient({ adapter });

/**
 * Delete all rows from every table in dependency-safe order.
 * Called before each test to guarantee a clean slate.
 */
export async function resetDatabase() {
  await testPrisma.inventoryTransaction.deleteMany();
  await testPrisma.client.deleteMany();
  await testPrisma.inventory.deleteMany();
  await testPrisma.product.deleteMany();
  await testPrisma.invite.deleteMany();
  await testPrisma.employee.deleteMany();
  await testPrisma.site.deleteMany();
  await testPrisma.company.deleteMany();
  await testPrisma.appUser.deleteMany();
}

/** Call in describe blocks that need a clean DB per test */
export function useCleanDatabase() {
  beforeAll(async () => {
    await resetDatabase();
  });

  beforeEach(async () => {
    resetUserCounter();
    await resetDatabase();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });
}
