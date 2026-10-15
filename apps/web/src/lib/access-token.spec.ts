// @vitest-environment node
// proxy.ts and lib/session.ts both run on the Node runtime, so these tests do too.

import { readFileSync } from "node:fs";

import { getUnixNow } from "@northguild/gmt";

import {
  expiresWithin,
  readTokenExp,
  readTokenSid,
  readTokenTimes,
  sameSignIn,
} from "./access-token";

// Only the clock is faked. Every other gmt export stays real.
vi.mock("@northguild/gmt", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@northguild/gmt")>()),
  getUnixNow: vi.fn(),
}));

// A made-up instant, in epoch seconds. Nothing here comes from a real token.
const NOW = 1_800_000_000;

function base64url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

// A JWT-shaped string with the given payload. The header and signature are
// made up: readTokenExp never checks the signature.
function tokenWith(payload: string): string {
  return `${base64url('{"alg":"HS256","typ":"JWT"}')}.${base64url(payload)}.signature_for-tests`;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("the module", () => {
  const source = readFileSync(new URL("./access-token.ts", import.meta.url), "utf8");

  it("does not import server-only, because proxy.ts imports it too", () => {
    expect(source).not.toMatch(/import\s+["']server-only["']/);
  });

  it("uses no Date and no Node-only Buffer", () => {
    expect(source).not.toMatch(/\bDate\b/);
    expect(source).not.toMatch(/\bBuffer\./);
  });
});

describe("readTokenExp", () => {
  it.each<[string, string, number]>([
    ["a good token", tokenWith(`{"sub":"7","sid":"s-1","exp":${NOW}}`), NOW],
    ["exp 0", tokenWith('{"exp":0}'), 0],
    ["a fractional exp", tokenWith('{"exp":1800000000.5}'), 1_800_000_000.5],
    ["a payload with UTF-8 text", tokenWith(`{"name":"Dude Ünïcødé ☕","exp":${NOW}}`), NOW],
    [
      "an empty signature part",
      `${tokenWith(`{"exp":${NOW}}`).split(".").slice(0, 2).join(".")}.`,
      NOW,
    ],
    ["a payload whose base64url needs padding", tokenWith(`{"exp":${NOW},"a":"x"}`), NOW],
  ])("reads exp from %s", (_name, token, expected) => {
    expect(readTokenExp(token)).toBe(expected);
  });

  it.each<[string, string]>([
    ["an empty string", ""],
    ["no dots", "not-a-jwt"],
    ["two parts", `${base64url("{}")}.${base64url(`{"exp":${NOW}}`)}`],
    ["four parts", `${tokenWith(`{"exp":${NOW}}`)}.extra`],
    ["an empty payload part", `${base64url("{}")}..signature`],
    ["a missing exp", tokenWith('{"sub":"7"}')],
    ["a string exp", tokenWith(`{"exp":"${NOW}"}`)],
    ["a null exp", tokenWith('{"exp":null}')],
    ["a boolean exp", tokenWith('{"exp":true}')],
    ["an object exp", tokenWith(`{"exp":{"value":${NOW}}}`)],
    ["an exp too large to be finite", tokenWith('{"exp":1e400}')],
    ["a payload that is a JSON array", tokenWith(`[${NOW}]`)],
    ["a payload that is JSON null", tokenWith("null")],
    ["a payload that is a JSON number", tokenWith(String(NOW))],
    ["a payload that isn't JSON", tokenWith("exp=1800000000")],
    // Five characters. No base64 string has a length of 4n + 1.
    ["bad base64: a length no base64 can have", `${base64url("{}")}.abcde.sig`],
    ["bad base64: plain base64 characters", `${base64url("{}")}.ab+c/d==.sig`],
    ["bad base64: a space", `${base64url("{}")}.${base64url(`{"exp":${NOW}}`)} .sig`],
    [
      "a payload that isn't UTF-8",
      `${base64url("{}")}.${Buffer.from([0xff, 0xfe, 0x7b]).toString("base64url")}.sig`,
    ],
    ["a control character", `${tokenWith(`{"exp":${NOW}}`)}\n`],
  ])("gives null for %s", (_name, token) => {
    expect(readTokenExp(token)).toBeNull();
  });

  it("reads only the payload, so a header that isn't JSON doesn't matter", () => {
    const token = `not-json.${base64url(`{"exp":${NOW}}`)}.sig`;

    expect(readTokenExp(token)).toBe(NOW);
  });

  it("gives null for a value that isn't a string", () => {
    expect(readTokenExp(undefined as unknown as string)).toBeNull();
    expect(readTokenExp(42 as unknown as string)).toBeNull();
  });
});

describe("readTokenTimes", () => {
  it("reads exp and iat from a token as Nest issues it", () => {
    const token = tokenWith(`{"sub":"7","sid":"s-1","iat":${NOW},"exp":${NOW + 900}}`);

    expect(readTokenTimes(token)).toStrictEqual({ exp: NOW + 900, iat: NOW });
  });

  it("keeps a fractional iat", () => {
    const token = tokenWith(`{"iat":${NOW}.5,"exp":${NOW + 60}}`);

    expect(readTokenTimes(token)).toStrictEqual({ exp: NOW + 60, iat: NOW + 0.5 });
  });

  it.each<[string, string]>([
    ["a missing iat", `{"exp":${NOW + 60}}`],
    ["a string iat", `{"iat":"${NOW}","exp":${NOW + 60}}`],
    ["a null iat", `{"iat":null,"exp":${NOW + 60}}`],
    ["an iat too large to be finite", `{"iat":1e400,"exp":${NOW + 60}}`],
    ["an iat equal to exp", `{"iat":${NOW},"exp":${NOW}}`],
    ["an iat after exp", `{"iat":${NOW + 61},"exp":${NOW + 60}}`],
  ])("gives iat null for %s, and still reads exp", (_name, payload) => {
    const times = readTokenTimes(tokenWith(payload));

    expect(times?.iat).toBeNull();
    expect(times?.exp).toBe(JSON.parse(payload).exp);
  });

  it.each<[string, string]>([
    ["no dots", "not-a-jwt"],
    ["a missing exp", tokenWith(`{"iat":${NOW}}`)],
    ["a string exp", tokenWith(`{"iat":${NOW},"exp":"${NOW}"}`)],
    ["a payload that isn't JSON", tokenWith("iat=1800000000")],
  ])("gives null for %s, as readTokenExp does", (_name, token) => {
    expect(readTokenTimes(token)).toBeNull();
    expect(readTokenExp(token)).toBeNull();
  });

  it("gives null for a value that isn't a string", () => {
    expect(readTokenTimes(undefined as unknown as string)).toBeNull();
  });
});

// Made-up sign-in ids, shaped like the UUIDs Nest uses.
const SID = "0b7e5c1a-4f2d-4c3b-9a8e-1d2c3b4a5f6e";
const OTHER_SID = "9f8e7d6c-5b4a-4321-8fed-cba987654321";

describe("readTokenSid", () => {
  it("reads sid from a token as Nest issues it", () => {
    expect(readTokenSid(tokenWith(`{"sub":"7","sid":"${SID}","exp":${NOW}}`))).toBe(SID);
  });

  it("reads sid with no exp, since it says nothing about time", () => {
    expect(readTokenSid(tokenWith(`{"sid":"${SID}"}`))).toBe(SID);
  });

  it.each<[string, string]>([
    ["an empty string", ""],
    ["no dots", "not-a-jwt"],
    ["a payload that isn't JSON", `${base64url("{}")}.${base64url("sid=x")}.sig`],
    ["a missing sid", tokenWith(`{"sub":"7","exp":${NOW}}`)],
    ["an empty sid", tokenWith('{"sid":""}')],
    ["a number sid", tokenWith('{"sid":42}')],
    ["a null sid", tokenWith('{"sid":null}')],
    ["an object sid", tokenWith(`{"sid":{"id":"${SID}"}}`)],
  ])("gives null for %s", (_name, token) => {
    expect(readTokenSid(token)).toBeNull();
  });

  it("gives null for a value that isn't a string", () => {
    expect(readTokenSid(undefined as unknown as string)).toBeNull();
  });
});

describe("sameSignIn", () => {
  const ours = tokenWith(`{"sub":"7","sid":"${SID}","exp":${NOW}}`);
  // A fresh token from a refresh of the same sign-in: new exp, same sid.
  const oursRefreshed = tokenWith(`{"sub":"7","sid":"${SID}","exp":${NOW + 900}}`);
  const theirs = tokenWith(`{"sub":"8","sid":"${OTHER_SID}","exp":${NOW + 900}}`);
  const noSid = tokenWith(`{"sub":"7","exp":${NOW + 900}}`);

  it("is true for two tokens with the same sid", () => {
    expect(sameSignIn(ours, oursRefreshed)).toBe(true);
  });

  it.each<[string, string | null, string | null]>([
    ["different sids", ours, theirs],
    ["no sid on the first", noSid, oursRefreshed],
    ["no sid on the second", ours, noSid],
    ["no sid on either", noSid, noSid],
    ["a malformed first token", "not-a-jwt", oursRefreshed],
    ["a missing first token", null, oursRefreshed],
    ["a missing second token", ours, null],
  ])("is false for %s", (_name, first, second) => {
    expect(sameSignIn(first, second)).toBe(false);
  });
});

describe("expiresWithin", () => {
  it("asks gmt for the current time in epoch seconds", () => {
    vi.mocked(getUnixNow).mockReturnValue(NOW);

    expiresWithin(NOW + 120, 60);

    expect(getUnixNow).toHaveBeenCalledWith({ epochUnit: "seconds" });
  });

  it.each<[string, number, boolean]>([
    ["61 seconds before exp", 61, false],
    ["60 seconds before exp", 60, true],
    ["59 seconds before exp", 59, true],
    ["at exp", 0, true],
    ["after exp", -30, true],
    ["a day before exp", 86_400, false],
  ])("with a 60-second window, %s gives %s", (_name, secondsLeft, expected) => {
    vi.mocked(getUnixNow).mockReturnValue(NOW);

    expect(expiresWithin(NOW + secondsLeft, 60)).toBe(expected);
  });

  it.each<[string, number, boolean]>([
    ["one second before exp", 1, false],
    ["at exp", 0, true],
    ["one second after exp", -1, true],
  ])("with a 0-second window, %s gives %s", (_name, secondsLeft, expected) => {
    vi.mocked(getUnixNow).mockReturnValue(NOW);

    expect(expiresWithin(NOW + secondsLeft, 0)).toBe(expected);
  });

  it("counts the token as expiring when gmt can't give the time", () => {
    vi.mocked(getUnixNow).mockReturnValue(null);

    expect(expiresWithin(NOW + 86_400, 60)).toBe(true);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "counts an exp of %s as expiring",
    (exp) => {
      vi.mocked(getUnixNow).mockReturnValue(NOW);

      expect(expiresWithin(exp, 60)).toBe(true);
    },
  );

  it("uses the real clock when nothing is mocked", async () => {
    const real = await vi.importActual<typeof import("@northguild/gmt")>("@northguild/gmt");
    vi.mocked(getUnixNow).mockImplementation(real.getUnixNow);
    const now = real.getUnixNow({ epochUnit: "seconds" }) ?? 0;

    expect(expiresWithin(now + 3600, 60)).toBe(false);
    expect(expiresWithin(now - 1, 60)).toBe(true);
  });
});
