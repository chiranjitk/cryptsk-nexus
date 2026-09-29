import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // ─── Resolve @/ alias to match tsconfig.json paths ─────────
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  // ─── Test configuration ────────────────────────────────────
  test: {
    globals: true, // Injects `vi`, `describe`, `it`, `expect`, etc. into global scope
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "examples/**", "gateway/**", "mini-services/**", "scripts/**", "skills/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      include: ["src/lib/**", "src/store/**"],
      exclude: ["**/*.test.ts", "**/*.test.tsx"],
    },
  },
});
