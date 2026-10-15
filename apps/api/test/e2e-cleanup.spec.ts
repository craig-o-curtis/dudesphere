import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { pluralize } from "mongoose";

import {
  cleanupE2eData,
  countE2eData,
  describeCheck,
  E2E_SLUG,
  E2E_TARGETS,
  type E2eCounts,
} from "./e2e-cleanup.js";

const NONE: E2eCounts = {
  users: 0,
  profiles: 0,
  refreshTokens: 0,
  emailTokens: 0,
  sessions: 0,
  abidings: 0,
  hashtags: 0,
};

describe("E2E_SLUG", () => {
  it("matches e2e plus 12 lower-case hex characters", () => {
    expect(E2E_SLUG.test("e2e3f7af56bef13")).toBe(true);
  });

  it.each([
    ["a real tag that starts with e2e", "e2etesting"],
    ["11 hex characters", "e2e3f7af56bef1"],
    ["13 hex characters", "e2e3f7af56bef13a"],
    ["upper-case hex", "e2e3F7AF56BEF13"],
    ["a character that is not hex", "e2e3f7af56bef1g"],
    ["the shape in the middle of a longer slug", "xe2e3f7af56bef13"],
  ])("does not match %s", (_case, slug) => {
    expect(E2E_SLUG.test(slug)).toBe(false);
  });
});

describe("describeCheck", () => {
  it("reports clean when every count is zero", () => {
    const report = describeCheck(NONE);

    expect(report.clean).toBe(true);
    expect(report.lines).toEqual([
      "[e2e check] found 0 abidings, 0 hashtags, 0 profiles, 0 refresh tokens, " +
        "0 email tokens, 0 sessions, 0 users",
      "[e2e check] clean: no e2e rows are left",
    ]);
  });

  it("reports each count and the total when rows are left", () => {
    const report = describeCheck({
      users: 2,
      profiles: 2,
      refreshTokens: 3,
      emailTokens: 1,
      sessions: 0,
      abidings: 4,
      hashtags: 1,
    });

    expect(report.clean).toBe(false);
    expect(report.lines).toEqual([
      "[e2e check] found 4 abidings, 1 hashtags, 2 profiles, 3 refresh tokens, " +
        "1 email tokens, 0 sessions, 2 users",
      "[e2e check] 13 e2e rows are left. Run `pnpm e2e:cleanup` to remove them.",
    ]);
  });

  it.each(Object.keys(NONE) as (keyof E2eCounts)[])(
    "is not clean when only %s is above zero",
    (key) => {
      expect(describeCheck({ ...NONE, [key]: 1 }).clean).toBe(false);
    },
  );
});

// The guard runs before any connection opens, so these never reach a
// database: a remote host is refused first.
describe("the local-database guard", () => {
  beforeEach(() => {
    vi.stubEnv("PG_HOST", "db.example.com");
    vi.stubEnv("MONGO_URI", "mongodb://localhost:27017/dude-abidings");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stops the cleanup when Postgres is not on this machine", async () => {
    await expect(cleanupE2eData("before")).rejects.toThrow(
      /Not local: Postgres at "db.example.com"/,
    );
  });

  it("stops the check when Postgres is not on this machine", async () => {
    await expect(countE2eData()).rejects.toThrow(/Not local: Postgres at "db.example.com"/);
  });

  it("stops the check when Mongo is not on this machine", async () => {
    vi.stubEnv("PG_HOST", "localhost");
    vi.stubEnv("MONGO_URI", "mongodb+srv://cluster.example.com/dude-abidings");

    await expect(countE2eData()).rejects.toThrow(/Not local: Mongo/);
  });
});

// QA-24 (WEB-54 review, round 3). The cleanup and `pnpm e2e:check` only see
// the tables and collections in E2E_TARGETS. A new one left off that list
// would keep its e2e rows for ever, and the check would still say "clean".
// So this reads every table and collection name from the source, and fails on
// any the list does not cover. It reads files only: it never connects to a
// database.
describe("what the e2e cleanup covers", () => {
  const SRC = fileURLToPath(new URL("../src/", import.meta.url));
  const CLEANUP_FILE = "apps/api/test/e2e-cleanup.ts";

  // Names that can never hold e2e data, each with the reason. Add to this
  // only when no e2e run can ever write a row there.
  const NEVER_E2E = new Map<string, string>([
    [
      "migrations",
      "TypeORM's own record of the migrations it has run. No migration creates it and " +
        "no e2e run writes to it.",
    ],
  ]);

  function sourceFiles(pattern: RegExp): string[] {
    return readdirSync(SRC, { recursive: true, encoding: "utf8" })
      .filter((file) => pattern.test(file) && !file.endsWith(".spec.ts"))
      .map((file) => withoutComments(readFileSync(join(SRC, file), "utf8")));
  }

  // Comments out, so a commented-out table does not count, and a doc comment
  // between a decorator and its class does not hide the class. The // rule
  // skips "://", so a URL in a string survives.
  function withoutComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  /** The index just past the bracket that closes the one at `open`. */
  function closeOf(source: string, open: number): number {
    const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
    const stack: string[] = [];
    let quote = "";
    for (let index = open; index < source.length; index += 1) {
      const char = source[index];
      if (quote) {
        if (char === "\\") {
          index += 1;
        } else if (char === quote) {
          quote = "";
        }
      } else if (char === '"' || char === "'" || char === "`") {
        quote = char;
      } else if (pairs[char]) {
        stack.push(pairs[char]);
      } else if (char === stack.at(-1)) {
        stack.pop();
        if (stack.length === 0) {
          return index + 1;
        }
      }
    }
    return source.length;
  }

  /** The `name` property of the object literal that starts at `open`, if it has one at its top level. */
  function topLevelName(source: string, open: number): string | undefined {
    const body = source.slice(open + 1, closeOf(source, open) - 1);
    for (let index = 0; index < body.length; index += 1) {
      const char = body[index];
      if ("([{".includes(char)) {
        // A nested object or array, such as a column's own `name`: skip it.
        index = closeOf(body, index) - 1;
      } else if (char === '"' || char === "'" || char === "`") {
        index = body.indexOf(char, index + 1);
        if (index === -1) {
          return undefined;
        }
      } else if (index === 0 || /[\s,]/.test(body[index - 1])) {
        const name = /^name\s*:\s*(["'`])([\w.]+)\1/.exec(body.slice(index));
        if (name) {
          return name[2];
        }
      }
    }
    return undefined;
  }

  /** "public.user" and "user" are the same table. */
  function bareTable(name: string): string {
    return name.split(".").at(-1) ?? name;
  }

  // Tables come from two places, so either one is enough to be caught:
  // - the migrations, in raw SQL (`CREATE TABLE`, the shape migration:generate
  //   writes) or through queryRunner.createTable(new Table({ name: ... }));
  // - the TypeORM entities, through @Entity("x") or @Entity({ name: "x" }).
  // Not caught: a table whose name is built at run time, such as
  // `CREATE TABLE ${name}` or new Table({ name: tableName }). The rule is that
  // a migration names its tables in literal text, as generate does.
  function postgresTables(): string[] {
    const names = new Set<string>();
    for (const source of sourceFiles(/^database\/migrations\/[^/]+\.ts$/)) {
      for (const match of source.matchAll(
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?((?:"?\w+"?\.)?"?\w+"?)/gi,
      )) {
        names.add(bareTable(match[1].replaceAll('"', "")));
      }
      for (const match of source.matchAll(/new\s+Table\s*\(\s*\{/g)) {
        const name = topLevelName(source, match.index + match[0].length - 1);
        if (name) {
          names.add(bareTable(name));
        }
      }
    }
    for (const source of sourceFiles(/\.ts$/)) {
      for (const match of source.matchAll(/@Entity\(\s*(["'`])([\w.]+)\1/g)) {
        names.add(bareTable(match[2]));
      }
      for (const match of source.matchAll(/@Entity\(\s*\{/g)) {
        const name = topLevelName(source, match.index + match[0].length - 1);
        if (name) {
          names.add(bareTable(name));
        }
      }
    }
    return [...names].sort();
  }

  // Each schema is a @Schema() class, registered under its class name, as in
  // MongooseModule.forFeature([{ name: Abiding.name, schema: AbidingSchema }]),
  // so Mongoose names the collection by pluralizing that name, unless the
  // @Schema() options set a collection of their own. Other decorators may sit
  // between @Schema() and the class; comments are already gone.
  // Not caught: a schema built without @Schema(), such as new mongoose.Schema()
  // passed to mongoose.model(). The rule is that every collection has a
  // @Schema() class.
  function mongoCollections(): string[] {
    const toCollection = pluralize();
    const names = new Set<string>();
    for (const source of sourceFiles(/\.ts$/)) {
      for (const match of source.matchAll(/@Schema\s*\(/g)) {
        const optionsEnd = closeOf(source, match.index + match[0].length - 1);
        const options = source.slice(match.index, optionsEnd);
        let rest = source.slice(optionsEnd);
        // Skip the decorators that follow, each with its arguments if it has any.
        for (;;) {
          const decorator = /^\s*@[\w.]+\s*/.exec(rest);
          if (!decorator) {
            break;
          }
          rest = rest.slice(decorator[0].length);
          if (rest.startsWith("(")) {
            rest = rest.slice(closeOf(rest, 0));
          }
        }
        const target = /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/.exec(rest);
        if (!target) {
          continue;
        }
        const own = /collection\s*:\s*(["'`])([^"'`]+)\1/.exec(options);
        names.add(own ? own[2] : (toCollection?.(target[1]) ?? target[1]));
      }
    }
    return [...names].sort();
  }

  function coveredIn(store: "postgres" | "mongo"): Set<string> {
    return new Set(
      E2E_TARGETS.filter((target) => target.store === store).map((target) => target.name),
    );
  }

  function missing(found: string[], store: "postgres" | "mongo"): string[] {
    const covered = coveredIn(store);
    return found.filter((name) => !covered.has(name) && !NEVER_E2E.has(name));
  }

  function howToFix(kind: string, names: string[]): string {
    return (
      `The e2e cleanup does not cover the ${kind} ${names.map((name) => `"${name}"`).join(", ")}. ` +
      `Add each to E2E_TARGETS in ${CLEANUP_FILE}, with the user-id column (Postgres) or ` +
      `the filter (Mongo) that finds its e2e rows. Put it before "user" if it points at ` +
      `a user, because the user ids are read from that table. If it can never hold e2e ` +
      `data, add it to NEVER_E2E in apps/api/test/e2e-cleanup.spec.ts with the reason.`
    );
  }

  it("finds the tables and collections it checks", () => {
    // A guard on the scan itself: if a regex stops matching, the tests below
    // would pass on an empty list.
    expect(postgresTables()).toEqual(
      expect.arrayContaining(["user", "profile", "sessions", "refresh_tokens", "email_tokens"]),
    );
    expect(mongoCollections()).toEqual(expect.arrayContaining(["abidings", "hashtags"]));
  });

  it("covers every Postgres table", () => {
    const uncovered = missing(postgresTables(), "postgres");
    expect(uncovered, howToFix("Postgres table", uncovered)).toEqual([]);
  });

  it("covers every Mongo collection", () => {
    const uncovered = missing(mongoCollections(), "mongo");
    expect(uncovered, howToFix("Mongo collection", uncovered)).toEqual([]);
  });

  it("lists no name both as covered and as never holding e2e data", () => {
    const both = E2E_TARGETS.map((target) => target.name).filter((name) => NEVER_E2E.has(name));
    expect(both).toEqual([]);
  });

  it("deletes the user last, so every other target can still find the user ids", () => {
    expect(E2E_TARGETS.at(-1)?.name).toBe("user");
  });

  it("deletes from Mongo before Postgres", () => {
    const stores = E2E_TARGETS.map((target) => target.store);
    expect(stores.lastIndexOf("mongo")).toBeLessThan(stores.indexOf("postgres"));
  });
});
