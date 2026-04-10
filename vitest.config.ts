import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: "./wrangler.toml",
      },
    }),
  ],
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "istanbul",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/config/types.ts"],
      reportOnFailure: true,
      thresholds: {
        lines: 80.01,
        functions: 80.01,
        branches: 80.01,
        statements: 80.01,
      },
    },
  },
});
