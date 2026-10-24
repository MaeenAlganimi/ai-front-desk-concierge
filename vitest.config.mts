import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    env: { CONCIERGE_MOCK: "1" },
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
