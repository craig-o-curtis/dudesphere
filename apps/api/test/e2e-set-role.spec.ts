import { UserRole } from "../src/users/user.entity.js";
import { E2E_USER_EMAIL, setE2eRole } from "./e2e-set-role.js";

// A stand-in for TypeORM's DataSource, so no test here opens a connection.
// `query` answers the UPDATE the way the Postgres driver does: [rows, count].
const db = vi.hoisted(() => ({
  initialize: vi.fn(),
  query: vi.fn(),
  destroy: vi.fn(),
  created: vi.fn(),
}));

vi.mock("typeorm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("typeorm")>()),
  DataSource: vi.fn(function FakeDataSource(options: unknown) {
    db.created(options);
    return { initialize: db.initialize, query: db.query, destroy: db.destroy };
  }),
}));

const EMAIL = "e2e-3f7af56bef13@example.com";
const LOCAL_MONGO = "mongodb://localhost:27017/dude-abidings";

beforeEach(() => {
  vi.stubEnv("PG_HOST", "localhost");
  vi.stubEnv("MONGO_URI", LOCAL_MONGO);
  db.initialize.mockResolvedValue(undefined);
  db.destroy.mockResolvedValue(undefined);
  db.query.mockResolvedValue([[], 1]);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("E2E_USER_EMAIL", () => {
  it("matches e2e- plus 12 lower-case hex characters at example.com", () => {
    expect(E2E_USER_EMAIL.test(EMAIL)).toBe(true);
  });

  it.each([
    ["the seeded admin's shape", "admin@example.com"],
    ["a real address", "walter@sobchak-security.com"],
    ["11 hex characters", "e2e-3f7af56bef1@example.com"],
    ["13 hex characters", "e2e-3f7af56bef13a@example.com"],
    ["upper-case hex", "e2e-3F7AF56BEF13@example.com"],
    ["a character that is not hex", "e2e-3f7af56bef1g@example.com"],
    ["another domain", "e2e-3f7af56bef13@example.org"],
    ["a subdomain of example.com", "e2e-3f7af56bef13@mail.example.com"],
    ["the shape inside a longer address", "xe2e-3f7af56bef13@example.com"],
    ["a trailing newline", `${EMAIL}\n`],
  ])("does not match %s", (_case, email) => {
    expect(E2E_USER_EMAIL.test(email)).toBe(false);
  });
});

describe("setE2eRole", () => {
  it("sets the role of the matching e2e user", async () => {
    await setE2eRole(EMAIL, "admin");

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith(`UPDATE "user" SET "role" = $1 WHERE "email" = $2`, [
      UserRole.ADMIN,
      EMAIL,
    ]);
    expect(db.destroy).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(`[e2e set-role] ${EMAIL} is now admin`);
  });

  it("accepts every role in UserRole", async () => {
    await setE2eRole(EMAIL, "user");

    expect(db.query).toHaveBeenCalledWith(expect.any(String), [UserRole.USER, EMAIL]);
  });

  it("fails when no user has that email, and still closes the connection", async () => {
    db.query.mockResolvedValue([[], 0]);

    await expect(setE2eRole(EMAIL, "admin")).rejects.toThrow(
      `No user has the email ${EMAIL}. Sign the user up first.`,
    );
    expect(db.destroy).toHaveBeenCalledTimes(1);
  });

  it("refuses an email that is not an e2e- user, before it connects", async () => {
    await expect(setE2eRole("admin@example.com", "admin")).rejects.toThrow(
      /only changes e2e- users.*"admin@example.com"/,
    );
    expect(db.created).not.toHaveBeenCalled();
  });

  it("refuses a role that is not in UserRole, before it connects", async () => {
    await expect(setE2eRole(EMAIL, "superuser")).rejects.toThrow(
      `"superuser" is not a role. Use one of: admin, user.`,
    );
    expect(db.created).not.toHaveBeenCalled();
  });

  it("refuses a role in the wrong case", async () => {
    await expect(setE2eRole(EMAIL, "ADMIN")).rejects.toThrow(/"ADMIN" is not a role/);
    expect(db.created).not.toHaveBeenCalled();
  });

  it("refuses a Postgres that is not on this machine, before it connects", async () => {
    vi.stubEnv("PG_HOST", "db.example.com");

    await expect(setE2eRole(EMAIL, "admin")).rejects.toThrow(
      /Not local: Postgres at "db.example.com"/,
    );
    expect(db.created).not.toHaveBeenCalled();
  });

  it("refuses a Mongo that is not on this machine, before it connects", async () => {
    vi.stubEnv("MONGO_URI", "mongodb+srv://cluster.example.com/dude-abidings");

    await expect(setE2eRole(EMAIL, "admin")).rejects.toThrow(/Not local: Mongo/);
    expect(db.created).not.toHaveBeenCalled();
  });

  it("connects to the Postgres that .env names", async () => {
    vi.stubEnv("PG_PORT", "5433");
    vi.stubEnv("PG_DATABASE", "dudesphere");

    await setE2eRole(EMAIL, "admin");

    expect(db.created).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "postgres",
        host: "localhost",
        port: 5433,
        database: "dudesphere",
      }),
    );
  });
});
