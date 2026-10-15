// @vitest-environment node
// lib/refresh.ts runs on the server only, so these tests run in Node.
//
// The single-flight Map lives at module level. Each test loads a fresh copy
// of the module through vi.resetModules(), so no test sees another's entries.

import { createHash } from "node:crypto";

import type { TokenPair } from "@dudesphere/api-types";

// The real package throws when imported outside a React Server Component
// build. Next resolves it to an empty module on the server; this does the same.
vi.mock("server-only", () => ({}));

// apiFetch is faked. ApiRequestError stays real. vi.hoisted keeps one fake
// across vi.resetModules(), so the test and the fresh module share it.
const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiFetch,
}));

// Made-up tokens in the shape Nest issues: 43 base64url characters.
const REFRESH_TOKEN = "refresh-token-for-tests_0123456789abcdefABC";
const OTHER_REFRESH_TOKEN = "other-refresh-token-for-tests_0123456789abc";
const FRESH_PAIR: TokenPair = {
  accessToken: "eyJhbGciOiJIUzI1NiJ9.fresh-access-token-for-tests.signature",
  refreshToken: "fresh-refresh-token-for-tests_0123456789abc",
  expiresIn: 900,
};
const SECOND_PAIR: TokenPair = {
  accessToken: "eyJhbGciOiJIUzI1NiJ9.second-access-token-for-tests.signature",
  refreshToken: "second-refresh-token-for-tests_0123456789a",
  expiresIn: 900,
};

let refreshOnce: typeof import("./refresh").refreshOnce;
let SETTLED_PAIR_HOLD_MS: number;

/** A promise the test settles by hand, to hold a call to Nest open. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

beforeEach(async () => {
  // mockReset, not mockClear: a queued answer a test didn't use must not
  // reach the next test.
  apiFetch.mockReset();
  vi.useFakeTimers();
  vi.resetModules();
  ({ refreshOnce, SETTLED_PAIR_HOLD_MS } = await import("./refresh"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("refreshOnce", () => {
  it("asks Nest to swap the token once, and gives back the pair", async () => {
    apiFetch.mockResolvedValueOnce(FRESH_PAIR);

    await expect(refreshOnce(REFRESH_TOKEN)).resolves.toBe(FRESH_PAIR);

    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith("/auth/token/refresh", {
      method: "POST",
      body: { refreshToken: REFRESH_TOKEN },
    });
  });

  it("holds a settled pair for 10 seconds", () => {
    expect(SETTLED_PAIR_HOLD_MS).toBe(10_000);
  });

  it("makes one Nest call for two calls at once, and both get the same pair", async () => {
    const nest = deferred<TokenPair>();
    apiFetch.mockReturnValueOnce(nest.promise);

    const first = refreshOnce(REFRESH_TOKEN);
    const second = refreshOnce(REFRESH_TOKEN);
    nest.resolve(FRESH_PAIR);

    expect(second).toBe(first);
    await expect(first).resolves.toBe(FRESH_PAIR);
    await expect(second).resolves.toBe(FRESH_PAIR);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("reuses the settled pair 9.9 seconds after it settled", async () => {
    apiFetch.mockResolvedValueOnce(FRESH_PAIR).mockResolvedValueOnce(SECOND_PAIR);
    await refreshOnce(REFRESH_TOKEN);

    vi.advanceTimersByTime(9_900);

    await expect(refreshOnce(REFRESH_TOKEN)).resolves.toBe(FRESH_PAIR);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("calls Nest again 10 seconds after the pair settled", async () => {
    apiFetch.mockResolvedValueOnce(FRESH_PAIR).mockResolvedValueOnce(SECOND_PAIR);
    await refreshOnce(REFRESH_TOKEN);

    vi.advanceTimersByTime(10_000);

    await expect(refreshOnce(REFRESH_TOKEN)).resolves.toBe(SECOND_PAIR);
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("starts the 10 seconds when Nest answers, not when the call began", async () => {
    const nest = deferred<TokenPair>();
    apiFetch.mockReturnValueOnce(nest.promise).mockResolvedValueOnce(SECOND_PAIR);

    const first = refreshOnce(REFRESH_TOKEN);
    vi.advanceTimersByTime(5_000);
    nest.resolve(FRESH_PAIR);
    await first;
    vi.advanceTimersByTime(9_900);

    await expect(refreshOnce(REFRESH_TOKEN)).resolves.toBe(FRESH_PAIR);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("drops a failure at once, so the next call asks Nest again", async () => {
    const failure = new Error("Nest refused");
    apiFetch.mockRejectedValueOnce(failure).mockResolvedValueOnce(FRESH_PAIR);

    await expect(refreshOnce(REFRESH_TOKEN)).rejects.toBe(failure);

    await expect(refreshOnce(REFRESH_TOKEN)).resolves.toBe(FRESH_PAIR);
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("gives a call that joined while Nest was busy the same failure", async () => {
    const nest = deferred<TokenPair>();
    const failure = new Error("Nest refused");
    apiFetch.mockReturnValueOnce(nest.promise);

    const first = refreshOnce(REFRESH_TOKEN);
    const second = refreshOnce(REFRESH_TOKEN);
    nest.reject(failure);

    await expect(first).rejects.toBe(failure);
    await expect(second).rejects.toBe(failure);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("keeps each token apart: a different token makes its own call", async () => {
    apiFetch.mockResolvedValueOnce(FRESH_PAIR).mockResolvedValueOnce(SECOND_PAIR);

    await expect(refreshOnce(REFRESH_TOKEN)).resolves.toBe(FRESH_PAIR);
    await expect(refreshOnce(OTHER_REFRESH_TOKEN)).resolves.toBe(SECOND_PAIR);

    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("keys the Map by the token's SHA-256 hex, never by the token itself", async () => {
    const set = vi.spyOn(Map.prototype, "set");
    apiFetch.mockResolvedValueOnce(FRESH_PAIR);

    await refreshOnce(REFRESH_TOKEN);

    const keys = set.mock.calls.map(([key]) => key);
    expect(keys).toContain(sha256Hex(REFRESH_TOKEN));
    expect(keys).not.toContain(REFRESH_TOKEN);
  });

  it("never keeps the process alive: the hold timer is unref'd", async () => {
    const unref = vi.fn();
    const realSetTimeout = globalThis.setTimeout;
    function setTimeoutWithSpiedUnref(...args: Parameters<typeof setTimeout>) {
      return Object.assign(realSetTimeout(...args), { unref });
    }
    // Node's setTimeout type also carries `__promisify__`, which a plain
    // function lacks, so the stand-in goes through `unknown`.
    vi.spyOn(globalThis, "setTimeout").mockImplementation(
      setTimeoutWithSpiedUnref as unknown as typeof setTimeout,
    );
    apiFetch.mockResolvedValueOnce(FRESH_PAIR);

    await refreshOnce(REFRESH_TOKEN);

    expect(unref).toHaveBeenCalledTimes(1);
  });
});
