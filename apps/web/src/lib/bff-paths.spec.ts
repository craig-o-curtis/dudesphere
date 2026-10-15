import { BFF_ALLOWED_PREFIXES, bffTarget } from "./bff-paths";

// Next hands the catch-all segments over already decoded, one
// decodeURIComponent per segment (getRouteMatcher in
// next/dist/shared/lib/router/utils/route-matcher.js). So "%2F" in the URL
// arrives here as "/" inside a segment, and "%252F" arrives as "%2F".

describe("BFF_ALLOWED_PREFIXES", () => {
  it("lists only the four prefixes this story allows", () => {
    expect(BFF_ALLOWED_PREFIXES).toEqual([
      ["abidings"],
      ["hashtags"],
      ["profiles"],
      ["users", "me"],
    ]);
  });
});

describe("bffTarget on an allowed path", () => {
  it.each([
    [["abidings"], "/abidings"],
    [["abidings", "e2e-dude"], "/abidings/e2e-dude"],
    [["hashtags"], "/hashtags"],
    [["hashtags", "e2e0123456789ab", "posts"], "/hashtags/e2e0123456789ab/posts"],
    [["profiles"], "/profiles"],
    [["profiles", "e2e-walter"], "/profiles/e2e-walter"],
    [["users", "me"], "/users/me"],
    [["users", "me", "settings"], "/users/me/settings"],
  ])("maps %j to %s", (segments, target) => {
    expect(bffTarget(segments, "")).toBe(target);
  });
});

describe("bffTarget on a path outside the allow-list", () => {
  it.each([
    ["no segments", []],
    ["users", ["users"]],
    ["users/1", ["users", "1"]],
    ["users/me-x", ["users", "me-x"]],
    ["users/mex/me", ["users", "mex", "me"]],
    ["auth/token", ["auth", "token"]],
    ["lanes, which waits for LANE-25", ["lanes", "games"]],
    ["a prefix in another case", ["Abidings"]],
    ["users/ME", ["users", "ME"]],
    ["a prefix with a suffix", ["abidingsx"]],
    ["a prefix that is only a start", ["abid"]],
  ])("gives null for %s", (_what, segments) => {
    expect(bffTarget(segments, "")).toBeNull();
  });
});

describe("bffTarget on a path trick", () => {
  it.each([
    ["a .. segment", ["abidings", "..", "users", "1"]],
    ["a leading .. segment", ["..", "users", "1"]],
    ["a . segment", ["abidings", ".", "x"]],
    ["a trailing . segment", ["users", "me", "."]],
    ["an empty segment", ["abidings", "", "x"]],
    ["a trailing empty segment", ["abidings", ""]],
    ["an encoded slash, decoded to /", ["abidings", "a/b"]],
    ["an encoded slash that would climb out", ["abidings", "..%2F..%2Fusers"]],
    ["a double-encoded slash, decoded once to %2F", ["abidings", "a%2Fb"]],
    ["a lone % after decoding", ["abidings", "100%"]],
    ["a backslash", ["abidings", "a\\b"]],
    ["a backslash that would climb out", ["abidings", "..\\users"]],
    ["a NUL", ["abidings", "a\u0000b"]],
    ["a line feed", ["abidings", "a\nb"]],
    ["a carriage return", ["abidings", "a\rb"]],
    ["a tab", ["abidings", "a\tb"]],
    ["a DEL", ["abidings", "a\u007fb"]],
    ["a trick inside an allowed prefix", ["users", "me", "..", "..", "auth"]],
  ])("gives null for %s", (_what, segments) => {
    expect(bffTarget(segments, "")).toBeNull();
  });
});

describe("bffTarget's query string", () => {
  it.each([
    ["", "/hashtags"],
    ["?q=dude", "/hashtags?q=dude"],
    ["?q=the%20dude&limit=20", "/hashtags?q=the%20dude&limit=20"],
    ["?cursor=abc%2Fdef", "/hashtags?cursor=abc%2Fdef"],
  ])("keeps %j as given", (search, target) => {
    expect(bffTarget(["hashtags"], search)).toBe(target);
  });

  it("gives null for a search string that doesn't start with ?", () => {
    expect(bffTarget(["hashtags"], "q=dude")).toBeNull();
  });
});

describe("bffTarget's encoding", () => {
  it.each([
    [["profiles", "the dude"], "/profiles/the%20dude"],
    [["profiles", "a?b"], "/profiles/a%3Fb"],
    [["profiles", "a#b"], "/profiles/a%23b"],
    [["profiles", "a&b=c"], "/profiles/a%26b%3Dc"],
    [["profiles", "café"], "/profiles/caf%C3%A9"],
    [["profiles", "..."], "/profiles/..."],
  ])("re-encodes each segment of %j", (segments, target) => {
    expect(bffTarget(segments, "")).toBe(target);
  });
});
