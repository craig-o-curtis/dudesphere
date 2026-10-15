// Cleans up what the e2e suites write to the dev databases.
//
// vitest runs setup() once before any e2e file and teardown() once after the
// last one. Both call the same cleanup, so a run starts from a clean slate even
// if the previous run was killed, and ends with nothing left behind.
//
// The cleanup itself, and the e2e shapes it relies on, are in
// test/e2e-cleanup.ts. `pnpm e2e:cleanup` and the web Playwright suite run the
// same code.
import "dotenv/config";
import { cleanupE2eData } from "./e2e-cleanup.js";

export async function setup(): Promise<void> {
  await cleanupE2eData("before");
}

export async function teardown(): Promise<void> {
  await cleanupE2eData("after");
}
