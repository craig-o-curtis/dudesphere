// Finds values from .env in what is about to be committed. The git hooks in
// .githooks/ run it through check-env-leaks.ts; this file is the part that
// can be tested without git.
//
// A leak is reported by the name of its variable, never by its value, so the
// check itself cannot print a secret into a terminal or a log.

/** Shorter values are skipped. They are usernames, ports and flags, not secrets. */
export const MIN_SECRET_LENGTH = 8;

export interface EnvLeak {
  /** The .env variable whose value was found, such as "PG_ADMIN_PW". */
  variable: string;
  /** Where it was found, such as "README.md, line 12". */
  where: string;
}

/**
 * The .env values worth guarding, each with the variables that hold it.
 *
 * A value is skipped when it is shorter than MIN_SECRET_LENGTH, or when it is
 * written anywhere in .env.example, comments included: that file is committed,
 * so what it says is public by choice. Values are lower-cased, and every match
 * ignores case, so an address typed with a capital letter is still caught.
 */
export function secretsFrom(
  env: Record<string, string>,
  exampleText: string,
): Map<string, string[]> {
  const example = exampleText.toLowerCase();
  const secrets = new Map<string, string[]>();

  for (const [variable, rawValue] of Object.entries(env)) {
    const value = rawValue.trim().toLowerCase();
    if (value.length < MIN_SECRET_LENGTH || example.includes(value)) {
      continue;
    }
    secrets.set(value, [...(secrets.get(value) ?? []), variable]);
  }
  return secrets;
}

/**
 * Leaks in the lines a staged diff adds. Lines it removes are not checked:
 * taking a value out is the fix, not the leak.
 *
 * Expects `git diff --cached -U0`, so every line in a hunk is an added or a
 * removed one, and the line numbers count from the hunk header.
 */
export function findLeaksInDiff(diff: string, secrets: Map<string, string[]>): EnvLeak[] {
  const leaks: EnvLeak[] = [];
  let file = "";
  let lineNumber = 0;
  // A "+++ " line names the file only in a file's header. Inside a hunk the
  // same text is an added line that starts with "++".
  let inHeader = false;

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      inHeader = true;
      continue;
    }
    if (inHeader) {
      if (line.startsWith("+++ ")) {
        file = line.slice(4).replace(/^b\//, "");
      }
      const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line);
      if (hunk) {
        inHeader = false;
        lineNumber = Number(hunk[1]);
      }
      continue;
    }

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line);
    if (hunk) {
      lineNumber = Number(hunk[1]);
      continue;
    }
    if (line.startsWith("+")) {
      for (const variable of variablesIn(line.slice(1), secrets)) {
        leaks.push({ variable, where: `${file}, line ${lineNumber}` });
      }
      lineNumber += 1;
    }
  }
  return leaks;
}

/**
 * Leaks in a commit message, as git hands it to the commit-msg hook.
 *
 * Git's own comment lines are skipped, and so is everything below the
 * scissors line that `git commit -v` adds: that part is the diff, which the
 * pre-commit hook has already checked, and git drops it from the message.
 */
export function findLeaksInMessage(message: string, secrets: Map<string, string[]>): EnvLeak[] {
  const leaks: EnvLeak[] = [];
  const lines = message.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith("# ------------------------ >8 ------------------------")) {
      break;
    }
    if (line.startsWith("#")) {
      continue;
    }
    for (const variable of variablesIn(line, secrets)) {
      leaks.push({ variable, where: `the commit message, line ${index + 1}` });
    }
  }
  return leaks;
}

/**
 * The staged paths that are .env files. Only .env.example may be committed;
 * .gitignore keeps the rest out, but `git add -f` gets past it.
 */
export function envFilesIn(paths: string[]): string[] {
  return paths.filter(isEnvFile);
}

function isEnvFile(filePath: string): boolean {
  const name = filePath.split("/").pop() ?? "";
  return name === ".env" || (name.startsWith(".env.") && name !== ".env.example");
}

function variablesIn(line: string, secrets: Map<string, string[]>): string[] {
  const text = line.toLowerCase();
  const found: string[] = [];
  for (const [value, variables] of secrets) {
    if (text.includes(value)) {
      found.push(variables.join(" and "));
    }
  }
  return found;
}
