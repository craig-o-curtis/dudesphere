// @vitest-environment node
// lib/route-responses.ts runs on the server only, so these tests run in Node.

import { readFileSync } from "node:fs";

import { ApiRequestError } from "./api";
import { logFailure, seeOther, seeOtherToHome } from "./route-responses";

// The real package throws when imported outside a React Server Component
// build. Next resolves it to an empty module on the server; this does the same.
vi.mock("server-only", () => ({}));

// A made-up token. Nothing here comes from a real sign-in.
const TOKEN = "refresh-token-for-tests";

function everythingLogged(...spies: { mock: { calls: unknown[][] } }[]): string {
  return spies
    .flatMap((spy) => spy.mock.calls)
    .flat()
    .map((part) => (part instanceof Error ? `${part.message} ${String(part.cause)}` : String(part)))
    .join("\n");
}

function quietConsole() {
  return {
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the module", () => {
  it("starts with import 'server-only', so a client bundle that imports it fails to build", () => {
    const source = readFileSync(new URL("./route-responses.ts", import.meta.url), "utf8");

    expect(source.trimStart().startsWith('import "server-only";')).toBe(true);
  });
});

describe("seeOther", () => {
  it("answers 303 with the path as a relative Location and no body", () => {
    const response = seeOther("/?signout=partial");

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/?signout=partial");
    expect(response.body).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each(["/", "/login", "/dudes/1?tab=lanes#top"])("keeps the same-origin path %s", (path) => {
    expect(seeOther(path).headers.get("location")).toBe(path);
  });

  it.each([
    ["another origin", "https://evil.example.com/"],
    ["a protocol-relative URL", "//evil.example.com"],
    ["a backslash trick", "/\\evil.example.com"],
    ["a path with no leading /", "login"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["an empty string", ""],
    ["a tab that URL would strip", "/\t/evil.example.com"],
    ["a path under /api", "/api/auth/logout"],
  ])("sends / in place of %s, never off this origin", (_what, path) => {
    const response = seeOther(path);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
  });

  it("gives a new Response each time, since a Response can be sent only once", () => {
    expect(seeOther("/")).not.toBe(seeOther("/"));
  });
});

describe("seeOtherToHome", () => {
  it("answers 303 with a relative Location of / and no body", () => {
    const response = seeOtherToHome();

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    expect(response.body).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("gives a new Response each time, since a Response can be sent only once", () => {
    expect(seeOtherToHome()).not.toBe(seeOtherToHome());
  });
});

describe("logFailure", () => {
  it("warns with the label and the route and status when Nest answered", () => {
    const { warn, error } = quietConsole();

    logFailure(
      "Sign out",
      new ApiRequestError("POST /auth/token/revoke answered 500", { status: 500 }),
    );

    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(everythingLogged(warn)).toBe("Sign out: POST /auth/token/revoke answered 500.");
  });

  it("logs an error with the label and message for any other Error, a bug in the app", () => {
    const { warn, error } = quietConsole();

    logFailure("Sign out everywhere", new Error("API_URL is not set."));

    expect(warn).not.toHaveBeenCalled();
    expect(everythingLogged(error)).toBe(
      "Sign out everywhere: could not call the API: API_URL is not set.",
    );
  });

  it("logs an error for a thrown value that isn't an Error", () => {
    const { error } = quietConsole();

    logFailure("Sign out", TOKEN);

    expect(everythingLogged(error)).toBe("Sign out: could not call the API: an unknown error.");
  });

  it("never logs Nest's error body or the error's cause, where a token could hide", () => {
    const { warn, error } = quietConsole();

    logFailure(
      "Sign out",
      new ApiRequestError("POST /auth/token/revoke answered 400", {
        status: 400,
        body: { statusCode: 400, message: [`refreshToken ${TOKEN} is wrong`] },
        cause: new Error(`cause holding ${TOKEN}`),
      }),
    );
    logFailure("Sign out", new Error("setup failed", { cause: new Error(TOKEN) }));

    expect(everythingLogged(warn, error)).not.toContain(TOKEN);
  });
});
