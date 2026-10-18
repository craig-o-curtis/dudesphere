// @vitest-environment node
// lib/bff-headers.ts runs on the server only, so these tests run in Node,
// with Node's own Headers and node:net.

import { readFileSync } from "node:fs";

import { BFF_HEADER_NAMES, bffHeadersFrom, clientIpOf } from "./bff-headers";

// The real package throws when imported outside a React Server Component
// build. Next resolves it to an empty module on the server; this does the same.
vi.mock("server-only", () => ({}));

// A made-up secret, 32 characters or more as Nest asks. Never a value from .env.
const SECRET = "made-up-bff-secret-for-tests-0123456789";

beforeEach(() => {
  vi.stubEnv("BFF_SECRET", SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the module", () => {
  it("starts with import 'server-only', so a client bundle that imports it fails to build", () => {
    const source = readFileSync(new URL("./bff-headers.ts", import.meta.url), "utf8");

    expect(source.trimStart().startsWith('import "server-only";')).toBe(true);
  });

  it("names the two headers it sends", () => {
    expect(BFF_HEADER_NAMES).toEqual(["X-Bff-Secret", "X-Client-Ip"]);
  });
});

describe("clientIpOf", () => {
  it("takes x-real-ip over x-forwarded-for", () => {
    const headers = new Headers({
      "x-real-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.1",
    });

    expect(clientIpOf(headers)).toBe("203.0.113.7");
  });

  it("takes the first x-forwarded-for entry when there is no x-real-ip", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 198.51.100.1, 192.0.2.10" });

    expect(clientIpOf(headers)).toBe("203.0.113.7");
  });

  it("takes x-forwarded-for when x-real-ip is empty", () => {
    const headers = new Headers({ "x-real-ip": "  ", "x-forwarded-for": "203.0.113.7" });

    expect(clientIpOf(headers)).toBe("203.0.113.7");
  });

  it.each([
    ["x-real-ip", { "x-real-ip": "  203.0.113.7  " }],
    ["x-forwarded-for", { "x-forwarded-for": "  203.0.113.7  ,198.51.100.1" }],
  ])("trims the spaces around %s", (_what, sent) => {
    expect(clientIpOf(new Headers(sent))).toBe("203.0.113.7");
  });

  it.each(["2001:db8::7", "::1", "::ffff:127.0.0.1"])("accepts the IPv6 address %s", (address) => {
    expect(clientIpOf(new Headers({ "x-real-ip": address }))).toBe(address);
  });

  it.each([
    ["text", "not-an-ip"],
    ["an address with text after a |", "1.2.3.4|x"],
    ["an address with a port", "203.0.113.7:443"],
    ["an IPv6 address in brackets", "[2001:db8::7]"],
  ])("gives null for %s in x-real-ip", (_what, value) => {
    expect(clientIpOf(new Headers({ "x-real-ip": value }))).toBeNull();
  });

  it.each([
    ["text", "not-an-ip"],
    ["an address with text after a |", "1.2.3.4|x, 203.0.113.7"],
    ["an empty first entry", ", 203.0.113.7"],
  ])("gives null for %s as the first x-forwarded-for entry", (_what, value) => {
    expect(clientIpOf(new Headers({ "x-forwarded-for": value }))).toBeNull();
  });

  it("doesn't fall back to x-forwarded-for when x-real-ip is there but not an address", () => {
    const headers = new Headers({ "x-real-ip": "not-an-ip", "x-forwarded-for": "203.0.113.7" });

    expect(clientIpOf(headers)).toBeNull();
  });

  it("gives null when neither header is there", () => {
    expect(clientIpOf(new Headers())).toBeNull();
  });
});

describe("bffHeadersFrom", () => {
  it("gives the secret and the visitor's address", () => {
    const headers = new Headers({ "x-real-ip": "203.0.113.7" });

    expect(bffHeadersFrom(headers)).toEqual({
      "X-Bff-Secret": SECRET,
      "X-Client-Ip": "203.0.113.7",
    });
  });

  it("gives the first x-forwarded-for entry when there is no x-real-ip", () => {
    const headers = new Headers({ "x-forwarded-for": " 198.51.100.1 , 203.0.113.7" });

    expect(bffHeadersFrom(headers)).toEqual({
      "X-Bff-Secret": SECRET,
      "X-Client-Ip": "198.51.100.1",
    });
  });

  it.each([
    ["not-an-ip", { "x-real-ip": "not-an-ip" }],
    ["1.2.3.4|x", { "x-forwarded-for": "1.2.3.4|x" }],
    ["an empty x-real-ip", { "x-real-ip": "" }],
    ["an empty x-forwarded-for", { "x-forwarded-for": "" }],
    ["no address header", {}],
  ])("gives {} for %s, never the secret alone", (_what, sent) => {
    expect(bffHeadersFrom(new Headers(sent))).toEqual({});
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
  ])("gives {} when BFF_SECRET is %s, never the address alone", (_what, secret) => {
    vi.stubEnv("BFF_SECRET", secret);

    expect(bffHeadersFrom(new Headers({ "x-real-ip": "203.0.113.7" }))).toEqual({});
  });

  // Made-up values in the shapes `openssl rand -base64 48` and
  // `openssl rand -hex 32` print, and base64url. Never a value from .env.
  it.each([
    ["base64, with + / and =", "made+up/bff+secret/for+the+web/spec+0123456789=="],
    ["base64url, with - and _", "made-up_bff-secret_for-the_web-spec_0123456789"],
    ["hex", "0123456789abcdef0123456789abcdef"],
  ])("sends a %s secret", (_what, secret) => {
    vi.stubEnv("BFF_SECRET", secret);

    expect(bffHeadersFrom(new Headers({ "x-real-ip": "203.0.113.7" }))).toEqual({
      "X-Bff-Secret": secret,
      "X-Client-Ip": "203.0.113.7",
    });
  });

  // The same rule Nest checks at startup (apps/api/src/config/env.validate.ts).
  // A CR or LF would make new Headers() throw with the whole secret in its
  // message, so a bad secret is never sent and nothing throws. There is no
  // NUL row: process.env cuts a value at its first NUL, so a NUL can't reach
  // BFF_SECRET here. Nest's spec tests the NUL, because it passes an object.
  it.each([
    ["31 characters", "b".repeat(31)],
    ["a line feed", "made-up-bff-secret-for-the-web\nspec-0123"],
    ["a carriage return", "made-up-bff-secret-for-the-web\rspec-0123"],
    ["a space", "made-up-bff-secret-for-the-web spec-0123"],
    ["a character outside ASCII", "made-up-bff-secret-for-the-webéspec-0123"],
  ])("gives {} and throws nothing when BFF_SECRET holds %s", (_what, secret) => {
    vi.stubEnv("BFF_SECRET", secret);

    expect(bffHeadersFrom(new Headers({ "x-real-ip": "203.0.113.7" }))).toEqual({});
  });
});
