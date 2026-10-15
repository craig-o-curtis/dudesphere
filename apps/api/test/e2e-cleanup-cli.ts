// `pnpm e2e:cleanup` and `pnpm e2e:check`, from the repo root or from
// apps/api.
//
//   tsx test/e2e-cleanup-cli.ts                     deletes every e2e row
//   tsx test/e2e-cleanup-cli.ts --label "web after" the same, with that label in its log line
//   tsx test/e2e-cleanup-cli.ts --check             deletes nothing; counts the e2e rows
//                                                   left, and exits 1 if there are any
//
// Both refuse to run unless both databases are on this machine (see
// test/local-databases.ts). Any failure exits 1, so a caller such as the web
// Playwright suite stops.
import "dotenv/config";
import { parseArgs } from "node:util";

import { cleanupE2eData, countE2eData, describeCheck } from "./e2e-cleanup.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      check: { type: "boolean", default: false },
      label: { type: "string", default: "cleanup" },
    },
  });

  if (!values.check) {
    await cleanupE2eData(values.label);
    return;
  }

  const report = describeCheck(await countE2eData());
  for (const line of report.lines) {
    console.log(line);
  }
  if (!report.clean) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? `[e2e] failed: ${error.message}` : error);
  process.exitCode = 1;
}
