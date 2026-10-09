import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: "./",
    include: ["**/*.e2e-spec.ts"],
    // Decorators like @Type() need this loaded first, same as vitest.config.ts.
    // It worked before only because something in the dependency tree happened
    // to load it, which is luck rather than configuration.
    setupFiles: ["reflect-metadata"],
    // Runs once before the first e2e file and once after the last, and
    // deletes everything the suites wrote to the dev databases.
    globalSetup: ["./test/global-setup.ts"],
  },
});
