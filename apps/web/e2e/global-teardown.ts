import type { FullConfig } from "@playwright/test";

import { runApiE2eCleanup } from "./global-setup";

// The same cleanup as global-setup.ts, after the last test. It leaves nothing
// behind, and fails the run loudly if it cannot.
export default function globalTeardown(config: FullConfig): void {
  runApiE2eCleanup(config, "web after");
}
