import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Run the e2e suites in a zone far from UTC. CI machines run in UTC, where a
// timestamp read in "the machine's zone" happens to be right, so a whole
// class of bug is invisible there: createdAt once came back three hours early
// on a developer's machine and no test could see it. Set before the workers
// start, so each one inherits it. test/timestamps.e2e-spec.ts checks that it
// took effect.
process.env.TZ = "Asia/Tokyo";

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
