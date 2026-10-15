import { defineConfig, devices } from "@playwright/test";

// The port is fixed at 3001 (the app's own port). E2E_PORT is an escape hatch
// for a machine where a dev server already holds 3001.
const port = Number(process.env.E2E_PORT ?? 3001);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  // Before the first test and after the last, the API deletes every e2e- user
  // this suite signed up (pnpm e2e:cleanup). Needs `pnpm db:up`.
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm build && pnpm exec next start -p ${port}`,
    url: `http://localhost:${port}`,
    // Never test against a server that is already running: it may be a dev
    // server, or an old build.
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
