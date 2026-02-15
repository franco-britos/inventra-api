import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Integration tests share a database — run files sequentially
    fileParallelism: false,
    // Generous timeout for DB operations
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
