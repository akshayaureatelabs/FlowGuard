import { defineConfig } from "vitest/config";

process.env.USE_DATABASE = process.env.USE_DATABASE || "false";
process.env.AUTH_DISABLED = process.env.AUTH_DISABLED || "true";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 15000,
  },
});
