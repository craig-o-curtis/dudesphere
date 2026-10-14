import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    // The folder this file sits in, so a run from the repo root sees only
    // this package's tests.
    root: import.meta.dirname,
    include: ["src/**/*.spec.ts"],
  },
});
