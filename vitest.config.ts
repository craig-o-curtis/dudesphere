import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: "./",
    include: ["**/*.spec.ts"],
    // Decorators like @Type() need this loaded first; Nest loads it for the app, tests must too
    setupFiles: ["reflect-metadata"],
  },
});
