import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    globals: true,
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 15_000,
    pool: "forks",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
    },
  },
  resolve: {
    // Resolve .js imports to .ts source files (standard ESM TypeScript convention)
    alias: [
      { find: /^(\.\.?\/.+)\.js$/, replacement: "$1.ts" },
    ],
  },
});
