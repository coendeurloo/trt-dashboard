import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      all: true,
      include: ["src/**/*.{ts,tsx}", "api/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/__tests__/**",
        "src/**/*.test.{ts,tsx}",
        "api/**/__tests__/**",
        "tests/**",
        "dist/**",
        "scripts/**"
      ],
      thresholds: {
        lines: 40,
        statements: 40,
        functions: 40,
        branches: 30
      }
    }
  }
});
