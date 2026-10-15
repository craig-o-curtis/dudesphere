import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";

import type { FullConfig } from "@playwright/test";

// Deletes the e2e- users this suite signs up, and everything tied to them.
//
// apps/web never touches a database, so this asks the API to do it: it runs
// `pnpm --filter @dudesphere/api e2e:cleanup` from the repo root, the same
// cleanup the API's own e2e run uses (apps/api/test/e2e-cleanup.ts).
// Playwright runs this file once before the first test, and
// global-teardown.ts runs the same cleanup after the last one. So a run starts
// clean even after a killed run, and ends with nothing left.
//
// The cleanup refuses to run unless both databases are on this machine. If it
// fails for any reason, this throws and the whole run stops.

/** Runs the API's e2e cleanup, with its output shown. Throws if it fails. */
export function runApiE2eCleanup(config: FullConfig, label: string): void {
  if (!config.configFile) {
    throw new Error("The e2e cleanup needs apps/web/playwright.config.ts to find the repo root.");
  }
  // playwright.config.ts sits in apps/web, two folders below the repo root.
  const repoRoot = resolve(dirname(config.configFile), "../..");
  const result = spawnSync(
    "pnpm",
    ["--filter", "@dudesphere/api", "e2e:cleanup", "--label", label],
    { cwd: repoRoot, stdio: "inherit" },
  );
  if (result.error) {
    throw new Error(`The e2e cleanup could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `The e2e cleanup failed (exit ${result.status ?? result.signal}). ` +
        "See its output above. If it could not connect, start the databases with `pnpm db:up`.",
    );
  }
}

export default function globalSetup(config: FullConfig): void {
  runApiE2eCleanup(config, "web before");
}
