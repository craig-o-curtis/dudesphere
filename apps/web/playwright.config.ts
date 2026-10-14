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
