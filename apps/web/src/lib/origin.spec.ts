import { assertSameOrigin } from "./origin";

function postWith(headers: Record<string, string>) {
  return new Request("http://localhost:3001/api/auth/logout", {
    method: "POST",
    headers,
  });
}

describe("assertSameOrigin", () => {
  describe("passes a same-origin request", () => {
    it.each([
      ["Origin equals Host", { origin: "http://localhost:3001", host: "localhost:3001" }],
      [
        "Origin equals x-forwarded-host",
        {
          origin: "https://dudesphere.example.com",
          host: "10.0.0.5:3001",
          "x-forwarded-host": "dudesphere.example.com",
        },
      ],
      [
        "Origin equals the first x-forwarded-host in a list",
        {
          origin: "https://dudesphere.example.com",
          host: "10.0.0.5:3001",
          "x-forwarded-host": "dudesphere.example.com, proxy.example.com",
        },
      ],
      [
        "an empty x-forwarded-host falls back to Host",
        { origin: "http://localhost:3001", host: "localhost:3001", "x-forwarded-host": "" },
      ],
      ["Host in capitals", { origin: "http://localhost:3001", host: "LOCALHOST:3001" }],
    ])("%s", (_name, headers) => {
      expect(assertSameOrigin(postWith(headers))).toBe(true);
    });
  });

  describe("fails any other request", () => {
    it.each([
      ["another origin", { origin: "https://evil.example.com", host: "localhost:3001" }],
      ["another port", { origin: "http://localhost:4000", host: "localhost:3001" }],
      ["a subdomain", { origin: "http://evil.localhost:3001", host: "localhost:3001" }],
      ["a missing Origin", { host: "localhost:3001" }],
      ["an empty Origin", { origin: "", host: "localhost:3001" }],
      ['an Origin of "null"', { origin: "null", host: "localhost:3001" }],
      ['an Origin of "NULL"', { origin: "NULL", host: "localhost:3001" }],
      ["an Origin that isn't a URL", { origin: "localhost:3001", host: "localhost:3001" }],
      ["an Origin with a path", { origin: "http://localhost:3001/api", host: "localhost:3001" }],
      [
        "an Origin with a trailing slash",
        { origin: "http://localhost:3001/", host: "localhost:3001" },
      ],
      [
        "an Origin with a default port, which no browser sends",
        { origin: "https://dudesphere.example.com:443", host: "dudesphere.example.com" },
      ],
      [
        "an Origin with user info",
        { origin: "http://user@localhost:3001", host: "localhost:3001" },
      ],
      [
        "an Origin that isn't http or https",
        { origin: "ftp://localhost:3001", host: "localhost:3001" },
      ],
      [
        "an extension Origin",
        { origin: "chrome-extension://localhost:3001", host: "localhost:3001" },
      ],
      [
        "an x-forwarded-host mismatch",
        {
          origin: "http://localhost:3001",
          host: "localhost:3001",
          "x-forwarded-host": "evil.example.com",
        },
      ],
      [
        "an x-forwarded-host whose second entry matches",
        {
          origin: "https://dudesphere.example.com",
          host: "10.0.0.5:3001",
          "x-forwarded-host": "evil.example.com, dudesphere.example.com",
        },
      ],
      [
        "Origin matching Host while x-forwarded-host differs",
        {
          origin: "http://10.0.0.5:3001",
          host: "10.0.0.5:3001",
          "x-forwarded-host": "dudesphere.example.com",
        },
      ],
    ])("%s", (_name, headers) => {
      expect(assertSameOrigin(postWith(headers))).toBe(false);
    });

    it("fails with neither Host nor x-forwarded-host", () => {
      const request = postWith({ origin: "http://localhost:3001" });
      request.headers.delete("host");
      expect(assertSameOrigin(request)).toBe(false);
    });
  });
});
