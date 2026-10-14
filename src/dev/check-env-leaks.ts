// Runner for the .env leak check. The logic lives in env-leaks.ts, so it can
// be tested without git. This file only reads .env and asks git what is
// staged, the same way print-token.ts wires up dev-token.ts.
//
// The git hooks in .githooks/ call it. `pnpm install` points git at them.
//
// Run by: .githooks/pre-commit   tsx src/dev/check-env-leaks.ts staged
//         .githooks/commit-msg   tsx src/dev/check-env-leaks.ts message <file>
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

import * as dotenv from "dotenv";

import {
  envFilesIn,
  findLeaksInDiff,
  findLeaksInMessage,
  secretsFrom,
  type EnvLeak,
} from "./env-leaks.js";

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function readIfPresent(file: string): string | undefined {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined;
}

function checkEnvLeaks(): number {
  const [mode, messageFile] = process.argv.slice(2);
  if (mode !== "staged" && !(mode === "message" && messageFile)) {
    console.error("Usage: check-env-leaks.ts staged | message <file>");
    return 2;
  }

  const root = git("rev-parse", "--show-toplevel").trim();
  const envText = readIfPresent(path.join(root, ".env"));
  // CI and a fresh clone have no .env, so there is nothing to leak.
  if (envText === undefined) {
    return 0;
  }
  const secrets = secretsFrom(
    dotenv.parse(envText),
    readIfPresent(path.join(root, ".env.example")) ?? "",
  );

  let envFiles: string[] = [];
  let leaks: EnvLeak[];
  if (mode === "message") {
    leaks = findLeaksInMessage(fs.readFileSync(messageFile, "utf8"), secrets);
  } else {
    const staged = git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z");
    envFiles = envFilesIn(staged.split("\0").filter(Boolean));
    const diff = git(
      "diff",
      "--cached",
      "--no-color",
      "--no-ext-diff",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      "-U0",
      "--diff-filter=ACMR",
    );
    leaks = findLeaksInDiff(diff, secrets);
  }

  if (envFiles.length === 0 && leaks.length === 0) {
    return 0;
  }

  console.error("Commit stopped: it would publish something from your .env.");
  for (const file of envFiles) {
    console.error(`  ${file} is a .env file. Unstage it: git restore --staged ${file}`);
  }
  for (const leak of leaks) {
    console.error(`  The value of ${leak.variable} is in ${leak.where}.`);
  }
  console.error(
    "No value is shown here. Take each one out and commit again. If a value is not secret, write it in .env.example instead.",
  );
  return 1;
}

process.exitCode = checkEnvLeaks();
