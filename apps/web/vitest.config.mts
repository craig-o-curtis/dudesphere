import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // Reads the `@/*` alias from tsconfig.json.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    // The folder this file sits in, so a run from the repo root sees only
    // this app's tests.
    root: import.meta.dirname,
    environment: "jsdom",
    include: ["src/**/*.spec.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
