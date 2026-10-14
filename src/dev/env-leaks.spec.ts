import {
  envFilesIn,
  findLeaksInDiff,
  findLeaksInMessage,
  MIN_SECRET_LENGTH,
  secretsFrom,
} from "./env-leaks.js";

// Made-up values. None of these is from a real .env: the address is at
// example.com, and the passwords were typed for this file.
const env = {
  NODE_ENV: "development",
  PG_ADMIN_USER: "maude",
  PG_ADMIN_PW: "rug-ties-the-room",
  PASSWORD: "rug-ties-the-room",
  MG_ADMIN_PW: "white-russian-77",
  EMAIL: "the-dude@example.com",
  JWT_ISSUER: "dudesphere",
};

const example = [
  "# development, staging, production or test. Default: development",
  "NODE_ENV=development",
  "JWT_ISSUER=dudesphere",
  "PG_ADMIN_PW=''",
].join("\n");

const secrets = secretsFrom(env, example);

describe("secretsFrom", () => {
  it("guards each value long enough to be a secret", () => {
    expect([...secrets.keys()].sort()).toEqual([
      "rug-ties-the-room",
      "the-dude@example.com",
      "white-russian-77",
    ]);
  });

  it("skips a value written in .env.example, since that file is public", () => {
    expect(secrets.has("dudesphere")).toBe(false);
    expect(secrets.has("development")).toBe(false);
  });

  it(`skips a value shorter than ${MIN_SECRET_LENGTH} characters`, () => {
    expect(secrets.has("maude")).toBe(false);
  });

  it("names every variable that shares a value", () => {
    expect(secrets.get("rug-ties-the-room")).toEqual(["PG_ADMIN_PW", "PASSWORD"]);
  });
});

describe("findLeaksInDiff", () => {
  const diff = [
    "diff --git a/README.md b/README.md",
    "index 1111111..2222222 100644",
    "--- a/README.md",
    "+++ b/README.md",
    "@@ -10,0 +11,2 @@",
    "+Log in to pgAdmin as The-Dude@example.com.",
    "+Nothing secret here.",
    "@@ -30 +32 @@",
    "-Old line with white-russian-77 in it",
    "+- **MongoDB**: `dude` / `white-russian-77`",
    "diff --git a/notes.md b/notes.md",
    "--- a/notes.md",
    "+++ b/notes.md",
    "@@ -1,0 +1 @@",
    "+++ rug-ties-the-room",
  ].join("\n");

  it("reports each added line that holds a value, by variable and line", () => {
    expect(findLeaksInDiff(diff, secrets)).toEqual([
      { variable: "EMAIL", where: "README.md, line 11" },
      { variable: "MG_ADMIN_PW", where: "README.md, line 32" },
      { variable: "PG_ADMIN_PW and PASSWORD", where: "notes.md, line 1" },
    ]);
  });

  it("ignores a removed line, since taking a value out is the fix", () => {
    const removal = [
      "diff --git a/README.md b/README.md",
      "--- a/README.md",
      "+++ b/README.md",
      "@@ -5 +4,0 @@",
      "-- **MongoDB**: `dude` / `white-russian-77`",
    ].join("\n");

    expect(findLeaksInDiff(removal, secrets)).toEqual([]);
  });
});

describe("findLeaksInMessage", () => {
  it("reports a value in the message, but not in git's comments or the -v diff", () => {
    const message = [
      "Fix the pgAdmin login",
      "",
      "It was rug-ties-the-room before.",
      "# Please enter the commit message. white-russian-77",
      "# ------------------------ >8 ------------------------",
      "+the-dude@example.com",
    ].join("\n");

    expect(findLeaksInMessage(message, secrets)).toEqual([
      { variable: "PG_ADMIN_PW and PASSWORD", where: "the commit message, line 3" },
    ]);
  });
});

describe("envFilesIn", () => {
  it("picks out every .env file but .env.example", () => {
    expect(
      envFilesIn([".env", ".env.example", "config/.env.local", "src/env.ts", "docs/.envrc"]),
    ).toEqual([".env", "config/.env.local"]);
  });
});
