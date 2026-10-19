// Runs the real CLI module with a stubbed process.argv. setE2eRole is
// mocked, so no test here opens a connection, and each test checks the exit
// code and the message a caller such as the web Playwright suite would see.
const setRole = vi.hoisted(() => ({ setE2eRole: vi.fn() }));

vi.mock("./e2e-set-role.js", () => setRole);
vi.mock("dotenv/config", () => ({}));

const EMAIL = "e2e-3f7af56bef13@example.com";
const OTHER_EMAIL = "e2e-0a1b2c3d4e5f@example.com";

async function runCli(...args: string[]): Promise<void> {
  process.argv = ["node", "e2e-set-role-cli.ts", ...args];
  vi.resetModules();
  await import("./e2e-set-role-cli.js");
}

const originalArgv = process.argv;

beforeEach(() => {
  setRole.setE2eRole.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = undefined;
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("e2e-set-role-cli", () => {
  it("sets the role when given one --email and one --role", async () => {
    await runCli("--email", EMAIL, "--role", "admin");

    expect(setRole.setE2eRole).toHaveBeenCalledWith(EMAIL, "admin");
    expect(process.exitCode).toBeUndefined();
  });

  it("exits 1 when --role is missing", async () => {
    await runCli("--email", EMAIL);

    expect(setRole.setE2eRole).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(/Pass both --email and --role/),
    );
  });

  it("refuses a repeated --role, rather than take the last one", async () => {
    await runCli("--email", EMAIL, "--role", "admin", "--role", "user");

    expect(setRole.setE2eRole).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "[e2e set-role] failed: Pass --role once. It was passed 2 times.",
    );
  });

  it("refuses a repeated --email, even when the last one is valid", async () => {
    await runCli("--email", OTHER_EMAIL, "--email", EMAIL, "--role", "admin");

    expect(setRole.setE2eRole).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "[e2e set-role] failed: Pass --email once. It was passed 2 times.",
    );
  });

  it("refuses the --name=value form repeated, too", async () => {
    await runCli(`--email=${EMAIL}`, "--role=admin", "--role=user");

    expect(setRole.setE2eRole).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
