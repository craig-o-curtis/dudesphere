// `pnpm --filter @dudesphere/api e2e:set-role`, from the repo root, or
// `pnpm e2e:set-role` from apps/api.
//
//   tsx test/e2e-set-role-cli.ts --email e2e-3f7af56bef13@example.com --role admin
//
// Sets the role of one e2e user (see test/e2e-set-role.ts). It refuses an
// email that isn't an e2e user's, a role that isn't in UserRole, and any
// database not on this machine. It refuses a repeated --email or --role too,
// rather than quietly take the last one. Any failure, a missing flag
// included, exits 1, so a caller such as the web Playwright suite stops.
import "dotenv/config";
import { parseArgs } from "node:util";

import { setE2eRole } from "./e2e-set-role.js";

// `multiple: true` collects every use of a flag, so a repeat can be refused.
// Without it, parseArgs keeps only the last value.
function onlyOne(name: string, values: string[] | undefined): string | undefined {
  if (values && values.length > 1) {
    throw new Error(`Pass --${name} once. It was passed ${values.length} times.`);
  }
  return values?.[0];
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      email: { type: "string", multiple: true },
      role: { type: "string", multiple: true },
    },
  });
  const email = onlyOne("email", values.email);
  const role = onlyOne("role", values.role);

  if (!email || !role) {
    throw new Error(
      "Pass both --email and --role, such as --email e2e-...@example.com --role admin.",
    );
  }

  await setE2eRole(email, role);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? `[e2e set-role] failed: ${error.message}` : error);
  process.exitCode = 1;
}
