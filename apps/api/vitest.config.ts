import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    // The folder this file sits in, not the shell's working directory, so a
    // run started from the repo root still sees only this app's tests.
    root: import.meta.dirname,
    include: ["**/*.spec.ts"],
    // Decorators like @Type() need this loaded first; Nest loads it for the app, tests must too
    setupFiles: ["reflect-metadata"],
  },
});
