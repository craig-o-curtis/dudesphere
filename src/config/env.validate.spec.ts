import appConfig from "./app.config.js";
import { validateEnv } from "./env.validate.js";

// The smallest environment the app starts with: every required variable and
// nothing else.
const required = {
  PG_HOST: "db.internal",
  PG_PORT: "6543",
  PG_ADMIN_USER: "walter",
  PG_ADMIN_PW: "over-the-line",
  PG_DATABASE: "lebowski",
  JWT_SECRET: "the-rug-tied-the-room-together",
  DUDE_OBSERVE_APP_KEY: "observe-key",
  DUDE_OBSERVE_APP_SECRET: "observe-secret",
};

describe("validateEnv", () => {
  it("returns the values typed, with numbers converted from strings", () => {
    const env = validateEnv({ ...required, PORT: "8080", NODE_ENV: "staging" });

    expect(env.PG_HOST).toBe("db.internal");
    expect(env.PG_PORT).toBe(6543);
    expect(env.PORT).toBe(8080);
    expect(env.NODE_ENV).toBe("staging");
  });

  it("fills in the defaults for optional variables that are not set", () => {
    const env = validateEnv(required);

    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe("development");
    expect(env.MONGO_URI).toBe("mongodb://localhost:27017/dude-abidings");
    expect(env.JWT_EXPIRES_IN).toBe(3600);
    expect(env.JWT_AUDIENCE).toBe("dudesphere-api");
    expect(env.JWT_ISSUER).toBe("dudesphere");
  });

  it("reads the JWT settings when they are set", () => {
    const env = validateEnv({
      ...required,
      JWT_EXPIRES_IN: "900",
      JWT_AUDIENCE: "bowling-app",
      JWT_ISSUER: "lebowski",
    });

    expect(env.JWT_EXPIRES_IN).toBe(900);
    expect(env.JWT_AUDIENCE).toBe("bowling-app");
    expect(env.JWT_ISSUER).toBe("lebowski");
  });

  it.each(["abc", "0", "-5", "1.5"])("throws when JWT_EXPIRES_IN is %s", (seconds) => {
    expect(() => validateEnv({ ...required, JWT_EXPIRES_IN: seconds })).toThrow(/JWT_EXPIRES_IN/);
  });

  it("keeps variables it has no rule for, such as the seed login", () => {
    const env = validateEnv({ ...required, EMAIL: "admin@dude.com", HOME: "/home/node" });

    expect(env.EMAIL).toBe("admin@dude.com");
    expect(env).toHaveProperty("HOME", "/home/node");
  });

  describe("an empty value", () => {
    // Number("") is 0, so PORT='' used to start the app on a random port.
    it("means the default for PORT, not port 0", () => {
      expect(validateEnv({ ...required, PORT: "" }).PORT).toBe(3000);
    });

    // `??` does not catch "", so MONGO_URI='' used to reach Mongoose as "".
    it("means the default for MONGO_URI, not an empty string", () => {
      expect(validateEnv({ ...required, MONGO_URI: "" }).MONGO_URI).toBe(
        "mongodb://localhost:27017/dude-abidings",
      );
    });

    it("counts as missing for a required variable", () => {
      expect(() => validateEnv({ ...required, JWT_SECRET: "" })).toThrow(/JWT_SECRET/);
    });
  });

  it.each(Object.keys(required))("throws when %s is missing", (name) => {
    const { [name]: _removed, ...rest } = required as Record<string, string>;

    expect(() => validateEnv(rest)).toThrow(new RegExp(name));
  });

  // Number("abc") is NaN, which used to pass straight through to TypeORM.
  it.each(["abc", "0", "70000", "54.32"])("throws when PG_PORT is %s", (port) => {
    expect(() => validateEnv({ ...required, PG_PORT: port })).toThrow(/PG_PORT/);
  });

  it.each(["abc", "0", "70000"])("throws when PORT is %s", (port) => {
    expect(() => validateEnv({ ...required, PORT: port })).toThrow(/PORT/);
  });

  it("throws when NODE_ENV is not a known environment", () => {
    expect(() => validateEnv({ ...required, NODE_ENV: "EXAMPLE" })).toThrow(/NODE_ENV/);
  });

  it("throws when MONGO_URI is not a mongodb address", () => {
    expect(() => validateEnv({ ...required, MONGO_URI: "localhost:27017" })).toThrow(/MONGO_URI/);
  });

  it("names every bad variable in one error", () => {
    const { PG_HOST: _host, JWT_SECRET: _secret, ...rest } = required;

    expect(() => validateEnv(rest)).toThrow(/PG_HOST[\s\S]*JWT_SECRET/);
  });
});

describe("appConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the port through validateEnv, so PORT='' gives 3000", () => {
    for (const [name, value] of Object.entries(required)) {
      vi.stubEnv(name, value);
    }
    vi.stubEnv("PORT", "");

    expect(appConfig().port).toBe(3000);
  });
});
