import { loginHref, MAX_NEXT_PATH_LENGTH, safeNextPath } from "./next-path";

describe("loginHref", () => {
  it.each([
    ["null", null, "/login"],
    ["the root path", "/", "/login"],
    ["an empty string", "", "/login"],
    ["a plain path", "/dudes/1", "/login?next=%2Fdudes%2F1"],
    ["a path with ?, & and #", "/dudes?a=1&b=2#top", "/login?next=%2Fdudes%3Fa%3D1%26b%3D2%23top"],
  ])("%s", (_name, next, expected) => {
    expect(loginHref(next)).toBe(expected);
  });
});

describe("safeNextPath", () => {
  describe("keeps a same-origin path", () => {
    it.each([
      ["/", "/"],
      ["/?welcome=1", "/?welcome=1"],
      ["/dudes/1?x=1#y", "/dudes/1?x=1#y"],
      ["/dudes/1", "/dudes/1"],
      ["/login?next=%2Fdudes", "/login?next=%2Fdudes"],
      ["/apiary", "/apiary"],
      ["/dudes/api/1", "/dudes/api/1"],
      ["/#top", "/#top"],
    ])("%j gives %j", (value, expected) => {
      expect(safeNextPath(value)).toBe(expected);
    });
  });

  describe("gives back the parsed form, not the raw text", () => {
    it.each([
      ["/dudes/./1", "/dudes/1"],
      ["/dudes/../lanes", "/lanes"],
      ["/a b", "/a%20b"],
    ])("%j gives %j", (value, expected) => {
      expect(safeNextPath(value)).toBe(expected);
    });
  });

  describe("turns another origin into /", () => {
    it.each([
      "//evil.example.com",
      "///evil.example.com",
      "/\\evil.example.com",
      "\\/evil.example.com",
      "/\\/evil.example.com",
      "https://evil.example.com",
      "http://evil.example.com/dudes",
      "HTTPS://evil.example.com",
      "//evil.example.com/dudes?x=1",
      "evil.example.com",
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "?welcome=1",
      "#top",
      "dudes/1",
    ])("%j", (value) => {
      expect(safeNextPath(value)).toBe("/");
    });
  });

  describe("turns encoded slashes and backslashes into /", () => {
    it.each([
      "/%2F/evil.example.com",
      "/%2f/evil.example.com",
      "/%5C/evil.example.com",
      "/%5c/evil.example.com",
      "/%2F%2Fevil.example.com",
      "/dudes%2F..%2F..%2Fapi",
      "/dudes/..%2fapi",
      "/dudes/%2e%2e%2fapi",
      "/%252F/evil.example.com",
    ])("%j", (value) => {
      expect(safeNextPath(value)).toBe("/");
    });
  });

  describe("turns control characters and whitespace tricks into /", () => {
    it.each([
      ["a tab after the slash", "/\t/evil.example.com"],
      ["a backslash and t", String.raw`/\t/evil`],
      ["a newline", "/\n/evil.example.com"],
      ["a carriage return", "/dudes\r\nSet-Cookie: x=1"],
      ["a NUL", "/dudes\u0000"],
      ["a DEL", "/dudes\u007F"],
      ["a C1 control", "/dudes\u0085"],
      ["a leading space", " /dudes"],
      ["a leading tab", "\t/dudes"],
      ["a leading newline", "\n//evil.example.com"],
      ["a leading no-break space", " /dudes"],
      ["a trailing newline", "/dudes\n"],
      ["an encoded tab", "/%09/evil.example.com"],
      ["an encoded newline", "/dudes%0D%0ASet-Cookie:%20x=1"],
      ["a broken escape", "/dudes/%E0%A4%A"],
    ])("%s", (_name, value) => {
      expect(safeNextPath(value)).toBe("/");
    });
  });

  describe("turns any path under /api into /", () => {
    it.each([
      "/api/auth/logout",
      "/api/auth/logout-everywhere",
      "/api",
      "/api/",
      "/api?x=1",
      "/api#x",
      "/API/auth/logout",
      "/Api/auth/logout",
      "/%61pi/auth/logout",
      "/%41PI/auth/logout",
      "/api%2Fauth%2Flogout",
      "/dudes/../api/auth/logout",
      "/dudes/%2e%2e/api/auth/logout",
      "/dudes/%2E%2E/API/auth/logout",
      "/%2e%2e/%2e%2e/api/auth/logout",
      "/./api/auth/logout",
      "/%2e/api/auth/logout",
    ])("%j", (value) => {
      expect(safeNextPath(value)).toBe("/");
    });
  });

  describe("turns a value that is too long into /", () => {
    it("keeps a path at the limit", () => {
      const value = `/${"a".repeat(MAX_NEXT_PATH_LENGTH - 1)}`;
      expect(safeNextPath(value)).toBe(value);
    });

    it("drops a path one past the limit", () => {
      expect(safeNextPath(`/${"a".repeat(MAX_NEXT_PATH_LENGTH)}`)).toBe("/");
    });

    it("drops a very long value", () => {
      expect(safeNextPath(`/${"a".repeat(1_000_000)}`)).toBe("/");
    });
  });

  describe("turns a value that isn't a string into /", () => {
    it.each([
      ["an empty string", ""],
      ["null", null],
      ["undefined", undefined],
      ["a number", 42],
      ["an array", ["/dudes"]],
      ["an object", { toString: () => "/dudes" }],
      ["a boolean", true],
      ["a URL", new URL("http://localhost/dudes")],
    ])("%s", (_name, value) => {
      expect(safeNextPath(value)).toBe("/");
    });
  });
});

describe("safeNextPath with a fallback", () => {
  // One value from each group above that gives "/". With a fallback, each
  // gives the fallback instead.
  const UNSAFE: [string, unknown][] = [
    ["another origin", "https://evil.example.com"],
    ["a protocol-relative URL", "//evil.example.com"],
    ["a backslash trick", "/\\evil.example.com"],
    ["an encoded slash", "/%2F/evil.example.com"],
    ["a control character", "/\t/evil.example.com"],
    ["a path under /api", "/api/auth/logout"],
    ["an encoded path under /api", "/%61pi/auth/logout"],
    ["a relative path", "dudes/1"],
    ["a broken escape", "/dudes/%E0%A4%A"],
    ["a value that is too long", `/${"a".repeat(MAX_NEXT_PATH_LENGTH)}`],
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
  ];

  it.each(UNSAFE)("gives the fallback for %s", (_name, value) => {
    expect(safeNextPath(value, "/feed")).toBe("/feed");
  });

  it.each(UNSAFE)("gives / for %s when no fallback is passed", (_name, value) => {
    expect(safeNextPath(value)).toBe("/");
  });

  it.each([
    ["/", "/"],
    ["/dudes/1?x=1#y", "/dudes/1?x=1#y"],
    ["/dudes/../lanes", "/lanes"],
  ])("keeps the safe path %j and ignores the fallback", (value, expected) => {
    expect(safeNextPath(value, "/feed")).toBe(expected);
  });

  it("treats an explicit undefined fallback as /", () => {
    expect(safeNextPath("https://evil.example.com", undefined)).toBe("/");
  });
});
