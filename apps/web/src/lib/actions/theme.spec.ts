import { cookies } from "next/headers";

import { setTheme } from "./theme";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

const cookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

function savedTheme(value?: string) {
  cookieStore.get.mockImplementation((name: string) =>
    name === "theme" && value !== undefined ? { name, value } : undefined,
  );
}

function themeForm(value: string) {
  const formData = new FormData();
  formData.append("theme", value);
  return formData;
}

function expectNoWrite() {
  expect(cookieStore.set).not.toHaveBeenCalled();
  expect(cookieStore.delete).not.toHaveBeenCalled();
}

describe("setTheme", () => {
  beforeEach(() => {
    vi.mocked(cookies).mockResolvedValue(
      cookieStore as unknown as Awaited<ReturnType<typeof cookies>>,
    );
    savedTheme(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(["light", "dark"] as const)(
    "sets the theme cookie to %s for one year when none is saved, and returns it",
    async (theme) => {
      vi.stubEnv("NODE_ENV", "development");

      await expect(setTheme(theme)).resolves.toBe(theme);

      expect(cookieStore.set).toHaveBeenCalledTimes(1);
      expect(cookieStore.set).toHaveBeenCalledWith("theme", theme, {
        maxAge: ONE_YEAR_IN_SECONDS,
        path: "/",
        sameSite: "lax",
        secure: false,
        httpOnly: false,
      });
      expect(cookieStore.delete).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["light", "dark"],
    ["dark", "light"],
  ] as const)(
    "sets the theme cookie to %s when %s is saved, and returns it",
    async (theme, saved) => {
      savedTheme(saved);

      await expect(setTheme(theme)).resolves.toBe(theme);

      expect(cookieStore.set).toHaveBeenCalledTimes(1);
      expect(cookieStore.set).toHaveBeenCalledWith("theme", theme, expect.any(Object));
      expect(cookieStore.delete).not.toHaveBeenCalled();
    },
  );

  it.each(["light", "dark"] as const)(
    "sets the theme cookie to %s again when it is already saved, so the year starts over",
    async (theme) => {
      savedTheme(theme);

      await expect(setTheme(theme)).resolves.toBe(theme);

      expect(cookieStore.set).toHaveBeenCalledTimes(1);
      expect(cookieStore.set).toHaveBeenCalledWith(
        "theme",
        theme,
        expect.objectContaining({ maxAge: ONE_YEAR_IN_SECONDS }),
      );
      expect(cookieStore.delete).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["light is saved", "light"],
    ["dark is saved", "dark"],
    ["nothing is saved", undefined],
    ["a junk value is saved", "blue"],
  ])(
    "deletes the theme cookie for system when %s, and returns null so the OS decides",
    async (_label, saved) => {
      savedTheme(saved);

      await expect(setTheme("system")).resolves.toBeNull();

      expect(cookieStore.delete).toHaveBeenCalledTimes(1);
      expect(cookieStore.delete).toHaveBeenCalledWith({ name: "theme", path: "/" });
      expect(cookieStore.set).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["a junk value", "blue"],
    ["markup", '"><script>alert(1)</script>'],
    ["an empty value", ""],
    ["the wrong case", "Dark"],
  ])("sets dark and returns it when %s is saved", async (_label, saved) => {
    savedTheme(saved);

    await expect(setTheme("dark")).resolves.toBe("dark");

    expect(cookieStore.set).toHaveBeenCalledTimes(1);
    expect(cookieStore.set).toHaveBeenCalledWith("theme", "dark", expect.any(Object));
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it.each(["light", "dark", "system"])(
    "does not read the saved cookie to decide what %s means",
    async (intent) => {
      savedTheme("dark");

      await setTheme(intent);

      expect(cookieStore.get).not.toHaveBeenCalled();
    },
  );

  it("marks the cookie Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await setTheme("dark");

    expect(cookieStore.set).toHaveBeenCalledWith(
      "theme",
      "dark",
      expect.objectContaining({ secure: true, httpOnly: false }),
    );
  });

  // A Server Action is a public POST endpoint. Its TypeScript signature does not
  // bind a caller: a fetch-style call with a `Next-Action` header can send any
  // value React can decode. None of them may throw (SEC-2) or write a cookie.
  const badInputs: [string, unknown][] = [
    ["an unknown word", "blue"],
    ["the wrong case of system", "System"],
    ["padded system", "system "],
    ["the wrong case", "Dark"],
    ["padding", " light"],
    ["an empty string", ""],
    ["markup", '"><script>alert(1)</script>'],
    ["a cookie attribute", "dark; Domain=example.com"],
    ["undefined", undefined],
    ["null", null],
    ["a number", 1],
    ["a boolean", true],
    ["a plain object", { theme: "dark" }],
    ["an object whose get is not a function", { get: "x" }],
    ["an array", ["dark"]],
    ["a FormData holding dark", themeForm("dark")],
    ["a file", new Blob(["dark"])],
  ];

  it.each(badInputs)(
    "ignores %s, writes no cookie and returns the saved theme",
    async (_label, input) => {
      savedTheme("dark");

      await expect(setTheme(input)).resolves.toBe("dark");

      expectNoWrite();
    },
  );

  it.each(badInputs)(
    "ignores %s, writes no cookie and returns null when no theme is saved",
    async (_label, input) => {
      await expect(setTheme(input)).resolves.toBeNull();

      expectNoWrite();
    },
  );

  it("ignores bad input and returns null when the saved theme is junk", async () => {
    savedTheme("blue");

    await expect(setTheme({ get: "x" })).resolves.toBeNull();

    expectNoWrite();
  });
});
