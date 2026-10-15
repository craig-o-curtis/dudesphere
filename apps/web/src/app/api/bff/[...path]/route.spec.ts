// @vitest-environment node
// A Route Handler runs on the server, so these tests run in Node, with Node's
// own Request, Response and fetch. lib/bff-paths.ts, lib/origin.ts and
// lib/api.ts are the real modules: only verifySession, fetch and API_URL are
// stand-ins.

import { verifySession } from "@/lib/session";

import * as route from "./route";
import { DELETE, GET, PATCH, POST } from "./route";

// The real package throws when imported outside a React Server Component
// build. Next resolves it to an empty module on the server; this does the same.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/session", () => ({
  verifySession: vi.fn(),
}));

const API_URL = "http://api.example.com";
const APP_ORIGIN = "http://localhost:3001";
const APP_HOST = "localhost:3001";

// Made-up tokens. Nothing here comes from a real sign-in.
const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiJ9.access-token-for-tests.signature_for-tests";
const BROWSER_BEARER = "Bearer browser-supplied-token-for-tests";
const BROWSER_COOKIE = "__Host-session=cookie-token-for-tests; __Secure-refresh=refresh-for-tests";
const SESSION_EXP = 1_900_000_000;

const fetchMock = vi.fn<typeof fetch>();

type Handler = typeof GET;
type Method = "GET" | "POST" | "PATCH" | "DELETE";

const HANDLERS: Record<Method, Handler> = { GET, POST, PATCH, DELETE };
const WRITES = ["POST", "PATCH", "DELETE"] as const;

interface BffRequestOptions {
  method?: Method;
  /** The catch-all segments, as Next gives them: decoded once. */
  path?: string[];
  search?: string;
  headers?: Record<string, string>;
  body?: string;
}

function bffRequest({
  method = "GET",
  path = ["hashtags"],
  search = "",
  headers = { origin: APP_ORIGIN },
  body,
}: BffRequestOptions = {}) {
  const request = new Request(`${APP_ORIGIN}/api/bff/${path.join("/")}${search}`, {
    method,
    headers: { host: APP_HOST, ...headers },
    body,
  });
  return { request, context: { params: Promise.resolve({ path }) } };
}

async function call(options: BffRequestOptions = {}): Promise<Response> {
  const { request, context } = bffRequest(options);
  return HANDLERS[options.method ?? "GET"](request, context);
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

/** The URL and init of the one call the handler made to Nest. */
function nestCall(): { url: string; init: RequestInit & { duplex?: string } } {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  // The handler always passes the URL as a string.
  expect(typeof url).toBe("string");
  return { url: url as string, init: init ?? {} };
}

function nestHeaders(): Headers {
  return new Headers(nestCall().init.headers);
}

/** Everything the handler logged, joined, so a test can look for a token in it. */
function everythingLogged(...spies: { mock: { calls: unknown[][] } }[]): string {
  return spies
    .flatMap((spy) => spy.mock.calls)
    .flat()
    .map((part) => (part instanceof Error ? `${part.message} ${String(part.cause)}` : String(part)))
    .join("\n");
}

beforeEach(() => {
  vi.stubEnv("API_URL", API_URL);
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(verifySession).mockResolvedValue({ accessToken: ACCESS_TOKEN, exp: SESSION_EXP });
  fetchMock.mockImplementation(async () => jsonResponse(200, { items: [] }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("the module", () => {
  it("exports GET, POST, PATCH and DELETE, and nothing else", () => {
    expect(Object.keys(route).sort()).toEqual(["DELETE", "GET", "PATCH", "POST"]);
    expect(typeof route.GET).toBe("function");
    expect(typeof route.POST).toBe("function");
    expect(typeof route.PATCH).toBe("function");
    expect(typeof route.DELETE).toBe("function");
  });

  it.each(["HEAD", "PUT", "OPTIONS"])("doesn't export %s", (method) => {
    expect(route).not.toHaveProperty(method);
  });
});

describe("a path the BFF refuses", () => {
  it.each([
    ["users/1", ["users", "1"]],
    ["users/me-x", ["users", "me-x"]],
    ["users", ["users"]],
    ["abidings/../users/1", ["abidings", "..", "users", "1"]],
    ["an encoded slash", ["abidings", "a/b"]],
    ["a backslash", ["abidings", "a\\b"]],
    ["an empty segment", ["abidings", "", "x"]],
  ])(
    "answers 404 to GET %s, before the session check and with no Nest call",
    async (_what, path) => {
      const response = await call({ path });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ statusCode: 404, message: "Not Found" });
      expect(verifySession).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(WRITES)("answers 404 to a cross-origin %s, before the Origin check", async (method) => {
    const response = await call({
      method,
      path: ["users", "1"],
      headers: { origin: "https://evil.example.com" },
    });

    expect(response.status).toBe(404);
    expect(verifySession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the Origin check on writes", () => {
  it.each(
    WRITES.flatMap((method) => [
      [method, "another origin", { origin: "https://evil.example.com" }],
      [method, "no Origin", {}],
      [method, 'Origin "null"', { origin: "null" }],
    ]) as [Method, string, Record<string, string>][],
  )("answers 403 to %s with %s, before the session check", async (method, _what, headers) => {
    const response = await call({ method, path: ["abidings"], headers });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ statusCode: 403, message: "Forbidden" });
    expect(verifySession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets a GET through with no Origin", async () => {
    const response = await call({ headers: {} });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(WRITES)("lets a same-origin %s through", async (method) => {
    const response = await call({ method, path: ["abidings"] });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("the session check", () => {
  it.each(["GET", ...WRITES] as Method[])(
    "answers 401 to %s with no session, and makes no Nest call",
    async (method) => {
      vi.mocked(verifySession).mockResolvedValue(null);

      const response = await call({ method });

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ statusCode: 401, message: "Unauthorized" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

describe("the request to Nest", () => {
  it("goes to API_URL plus the re-encoded path and the query as given", async () => {
    await call({ path: ["profiles", "the dude"], search: "?q=the%20dude&limit=20" });

    expect(nestCall().url).toBe(`${API_URL}/profiles/the%20dude?q=the%20dude&limit=20`);
  });

  it.each(["GET", ...WRITES] as Method[])("keeps the method, %s", async (method) => {
    await call({ method, path: ["abidings"] });

    expect(nestCall().init.method).toBe(method);
  });

  it("carries the session's Bearer, not the browser's Authorization", async () => {
    await call({ headers: { authorization: BROWSER_BEARER } });

    expect(nestHeaders().get("authorization")).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it("never forwards the browser's Cookie or hop-by-hop headers", async () => {
    await call({
      method: "POST",
      path: ["abidings"],
      body: "{}",
      headers: {
        origin: APP_ORIGIN,
        "content-type": "application/json",
        authorization: BROWSER_BEARER,
        cookie: BROWSER_COOKIE,
        connection: "keep-alive, x-smuggled",
        "keep-alive": "timeout=5",
        "proxy-authorization": "Basic cHJveHk6Zm9yLXRlc3Rz",
        te: "trailers",
        upgrade: "websocket",
        "x-smuggled": "1",
        "x-forwarded-for": "203.0.113.7",
        "x-forwarded-host": APP_HOST,
        accept: "text/html",
      },
    });

    const sent = [...nestHeaders().keys()].sort();
    expect(sent).toEqual(["authorization", "content-type"]);
  });

  it("keeps Nest answers out of Next's fetch cache and times out like apiFetch", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");

    await call();

    const { init } = nestCall();
    expect(init.cache).toBe("no-store");
    expect(timeout).toHaveBeenCalledWith(15_000);
    expect(init.signal).toBe(timeout.mock.results[0]?.value);
  });

  it("never follows a redirect, so the Bearer stays with Nest", async () => {
    await call();

    expect(nestCall().init.redirect).toBe("manual");
  });

  it.each(["POST", "PATCH"] as const)(
    "streams the %s body with the browser's Content-Type and duplex half",
    async (method) => {
      const body = JSON.stringify({ username: "e2e-walter", note: "The Dude abides." });

      await call({
        method,
        path: ["abidings"],
        body,
        headers: { origin: APP_ORIGIN, "content-type": "application/json; charset=utf-8" },
      });

      const { init } = nestCall();
      expect(init.body).toBeInstanceOf(ReadableStream);
      expect(init.duplex).toBe("half");
      expect(new Headers(init.headers).get("content-type")).toBe("application/json; charset=utf-8");
      expect(await new Response(init.body).text()).toBe(body);
    },
  );

  it("sends no body and no Content-Type for a POST without a body", async () => {
    await call({ method: "POST", path: ["abidings"] });

    const { init } = nestCall();
    expect(init.body).toBeUndefined();
    expect(init.duplex).toBeUndefined();
    expect(new Headers(init.headers).has("content-type")).toBe(false);
  });

  it.each(["GET", "DELETE"] as const)(
    "sends no body and no Content-Type for %s",
    async (method) => {
      await call({
        method,
        path: ["abidings", "e2e-walter"],
        headers: { origin: APP_ORIGIN, "content-type": "application/json" },
      });

      const { init } = nestCall();
      expect(init.body).toBeUndefined();
      expect(init.duplex).toBeUndefined();
      expect(new Headers(init.headers).has("content-type")).toBe(false);
    },
  );
});

describe("the answer from Nest", () => {
  it("passes the status, body, Content-Type and Retry-After through", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, { statusCode: 429, message: "Too many requests" }, { "Retry-After": "30" }),
    );

    const response = await call();

    expect(response.status).toBe(429);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("retry-after")).toBe("30");
    expect(await response.json()).toEqual({ statusCode: 429, message: "Too many requests" });
  });

  it("passes a 201 and its body through for a POST", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: "e2e-abiding-1" }));

    const response = await call({ method: "POST", path: ["abidings"], body: "{}" });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "e2e-abiding-1" });
  });

  it("passes a 204 through with no body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const response = await call({ method: "DELETE", path: ["abidings", "e2e-walter"] });

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });

  it("passes Nest's 401 through and never refreshes", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { statusCode: 401, message: "Unauthorized" }));

    const response = await call();

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(nestCall().url).toBe(`${API_URL}/hashtags`);
  });

  it("copies no other header: no Set-Cookie, and nothing else from Nest", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        200,
        { ok: true },
        {
          "Set-Cookie": "nest=planted-for-tests; Path=/",
          "X-Powered-By": "Express",
          "Access-Control-Allow-Origin": "*",
          Location: "https://evil.example.com",
          Connection: "close",
        },
      ),
    );

    const response = await call();

    expect(response.headers.get("set-cookie")).toBeNull();
    expect([...response.headers.keys()].sort()).toEqual([
      "cache-control",
      "content-type",
      "x-content-type-options",
    ]);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("streams the body rather than reading it first", async () => {
    const encoder = new TextEncoder();
    const chunks = ['{"items":[', '{"tag":"e2e0123456789ab"}', "]}"];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    const nestResponse = new Response(stream, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    fetchMock.mockResolvedValue(nestResponse);

    const response = await call();

    expect(nestResponse.bodyUsed).toBe(false);
    expect(await response.text()).toBe(chunks.join(""));
  });
});

// Helmet's headers on Nest's answer don't pass through, so the handler sets
// its own on every answer: no-store, and nosniff so a browser never reads a
// body as anything but its Content-Type (SEC-5, AUTH-8 review round 1).
describe("the handler's own headers on every answer", () => {
  it.each<[string, () => void, BffRequestOptions]>([
    ["Nest's 200", () => {}, {}],
    [
      "Nest's 204",
      () => fetchMock.mockResolvedValue(new Response(null, { status: 204 })),
      { method: "DELETE", path: ["abidings", "e2e-walter"] },
    ],
    [
      "Nest's 500 that isn't JSON",
      () => fetchMock.mockResolvedValue(new Response("<b>oops</b>", { status: 500 })),
      {},
    ],
    ["the 404 for a refused path", () => {}, { path: ["users", "1"] }],
    [
      "the 403 for a cross-origin write",
      () => {},
      { method: "POST", path: ["abidings"], headers: { origin: "https://evil.example.com" } },
    ],
    ["the 401 with no session", () => vi.mocked(verifySession).mockResolvedValue(null), {}],
    [
      "the 502 when Nest doesn't answer",
      () => {
        vi.spyOn(console, "warn").mockImplementation(() => {});
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));
      },
      {},
    ],
  ])("%s says nosniff and no-store", async (_what, arrange, options) => {
    arrange();

    const response = await call(options);

    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("when Nest doesn't answer", () => {
  it.each([
    ["a network failure", new TypeError("fetch failed")],
    ["the timeout", new DOMException("The operation was aborted due to timeout", "TimeoutError")],
  ])("answers 502 after %s, and logs the route without a token", async (_what, failure) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(failure);

    const response = await call({ path: ["hashtags"], search: "?q=dude" });

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ statusCode: 502, message: "Bad Gateway" });
    const logged = everythingLogged(warn, error);
    expect(logged).toContain("GET /hashtags");
    expect(logged).not.toContain("q=dude");
    expect(logged).not.toContain(ACCESS_TOKEN);
  });

  it("answers 502 when API_URL is unset, and logs the setup error", async () => {
    vi.stubEnv("API_URL", "");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await call();

    expect(response.status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(everythingLogged(error)).toContain("API_URL is not set");
    expect(everythingLogged(error)).not.toContain(ACCESS_TOKEN);
  });
});
