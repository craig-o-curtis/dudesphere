import appConfig from "./app.config.js";
import { validateEnv } from "./env.validate.js";
import throttleConfig from "./throttle.config.js";

// The smallest environment the app starts with: every required variable and
// nothing else.
const required = {
  PG_HOST: "db.internal",
  PG_PORT: "6543",
  PG_ADMIN_USER: "walter",
  PG_ADMIN_PW: "over-the-line",
  PG_DATABASE: "lebowski",
  JWT_SECRET: "the-rug-really-tied-the-room-together",
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
    // 15 minutes, 7 days and 30 days.
    expect(env.JWT_EXPIRES_IN).toBe(900);
    expect(env.REFRESH_TOKEN_EXPIRES_IN).toBe(604800);
    expect(env.SESSION_EXPIRES_IN).toBe(2592000);
    // 180 days.
    expect(env.SESSION_RETENTION).toBe(15552000);
    expect(env.JWT_AUDIENCE).toBe("dudesphere-api");
    expect(env.JWT_ISSUER).toBe("dudesphere");
    // Rate limiting is on unless someone turns it off.
    expect(env.THROTTLE_ENABLED).toBe("true");
    // Mail goes to the Mailpit container unless it is pointed elsewhere, so
    // an app with no mail settings sends nothing real.
    expect(env.MAIL_HOST).toBe("localhost");
    expect(env.MAIL_PORT).toBe(1025);
    expect(env.MAIL_USER).toBeUndefined();
    expect(env.MAIL_PASSWORD).toBeUndefined();
    expect(env.MAIL_FROM).toBe("Dudesphere <no-reply@dudesphere.local>");
    expect(env.FRONTEND_URL).toBe("http://localhost:3000");
    expect(env.PASSWORD_RESET_EXPIRES_IN).toBe(1800);
  });

  it("reads the mail and password reset settings when they are set", () => {
    const env = validateEnv({
      ...required,
      MAIL_HOST: "smtp.example.com",
      MAIL_PORT: "587",
      MAIL_USER: "apikey",
      MAIL_PASSWORD: "s3cret",
      MAIL_FROM: "The Dude <dude@example.com>",
      FRONTEND_URL: "https://dudesphere.example.com",
      PASSWORD_RESET_EXPIRES_IN: "900",
    });

    expect(env.MAIL_HOST).toBe("smtp.example.com");
    expect(env.MAIL_PORT).toBe(587);
    expect(env.MAIL_USER).toBe("apikey");
    expect(env.MAIL_FROM).toBe("The Dude <dude@example.com>");
    expect(env.FRONTEND_URL).toBe("https://dudesphere.example.com");
    expect(env.PASSWORD_RESET_EXPIRES_IN).toBe(900);
  });

  it.each([
    ["FRONTEND_URL", "dudesphere.example.com"],
    ["FRONTEND_URL", "ftp://dudesphere.example.com"],
    ["MAIL_PORT", "0"],
    ["MAIL_PORT", "70000"],
    // Under a minute, every link would be dead before it was opened.
    ["PASSWORD_RESET_EXPIRES_IN", "59"],
  ])("throws when %s is %s", (name, value) => {
    expect(() => validateEnv({ ...required, [name]: value })).toThrow(new RegExp(name));
  });

  it("takes true or false for THROTTLE_ENABLED and nothing else", () => {
    expect(validateEnv({ ...required, THROTTLE_ENABLED: "false" }).THROTTLE_ENABLED).toBe("false");
    // "0" and "off" look like "false" to a person. Reading them as on, or as
    // off, would both be a guess, so the app refuses to start.
    expect(() => validateEnv({ ...required, THROTTLE_ENABLED: "0" })).toThrow(/THROTTLE_ENABLED/);
    expect(() => validateEnv({ ...required, THROTTLE_ENABLED: "off" })).toThrow(/THROTTLE_ENABLED/);
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
    const env = validateEnv({ ...required, EMAIL: "admin@example.com", HOME: "/home/node" });

    expect(env.EMAIL).toBe("admin@example.com");
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

  // Number() reads each of these as a port in range. Only plain digits pass.
  it.each(["0x10", "5e3", "+80"])("throws when PORT is %s, which is not plain digits", (port) => {
    expect(() => validateEnv({ ...required, PORT: port })).toThrow(/PORT/);
  });

  it("throws when NODE_ENV is not a known environment", () => {
    expect(() => validateEnv({ ...required, NODE_ENV: "EXAMPLE" })).toThrow(/NODE_ENV/);
  });

  it("throws when MONGO_URI is not a mongodb address", () => {
    expect(() => validateEnv({ ...required, MONGO_URI: "localhost:27017" })).toThrow(/MONGO_URI/);
  });

  describe("the refresh token and session lifetimes", () => {
    it("reads both as whole numbers of seconds", () => {
      const env = validateEnv({
        ...required,
        REFRESH_TOKEN_EXPIRES_IN: "86400",
        SESSION_EXPIRES_IN: "604800",
      });

      expect(env.REFRESH_TOKEN_EXPIRES_IN).toBe(86400);
      expect(env.SESSION_EXPIRES_IN).toBe(604800);
    });

    it.each([
      ["REFRESH_TOKEN_EXPIRES_IN", "59"],
      ["REFRESH_TOKEN_EXPIRES_IN", "abc"],
      ["SESSION_EXPIRES_IN", "59"],
      ["SESSION_EXPIRES_IN", "1.5"],
    ])("throws when %s is %s", (name, value) => {
      expect(() => validateEnv({ ...required, [name]: value })).toThrow(new RegExp(name));
    });

    // A refresh token never outlives its session, so this pair would cut
    // every refresh token short without saying so.
    it("throws when a session is shorter than one refresh token", () => {
      expect(() =>
        validateEnv({
          ...required,
          REFRESH_TOKEN_EXPIRES_IN: "604800",
          SESSION_EXPIRES_IN: "86400",
        }),
      ).toThrow(/SESSION_EXPIRES_IN must not be less than REFRESH_TOKEN_EXPIRES_IN/);
    });

    it("accepts a session exactly as long as one refresh token", () => {
      const env = validateEnv({
        ...required,
        REFRESH_TOKEN_EXPIRES_IN: "86400",
        SESSION_EXPIRES_IN: "86400",
      });

      expect(env.SESSION_EXPIRES_IN).toBe(86400);
    });
  });

  // How long a session's rows are kept after the session ends.
  describe("SESSION_RETENTION", () => {
    it("is read as a whole number of seconds", () => {
      const env = validateEnv({ ...required, SESSION_RETENTION: "31536000" });

      expect(env.SESSION_RETENTION).toBe(31536000);
    });

    // Rows are then deleted as soon as their session ends.
    it("accepts 0", () => {
      const env = validateEnv({ ...required, SESSION_RETENTION: "0" });

      expect(env.SESSION_RETENTION).toBe(0);
    });

    it.each(["-1", "1.5", "abc"])("throws when it is %s", (value) => {
      expect(() => validateEnv({ ...required, SESSION_RETENTION: value })).toThrow(
        /SESSION_RETENTION/,
      );
    });
  });

  // A short key can be guessed from one real token. See env.validate.ts.
  describe("JWT_SECRET", () => {
    it("throws when it is 31 characters", () => {
      expect(() => validateEnv({ ...required, JWT_SECRET: "a".repeat(31) })).toThrow(
        /JWT_SECRET must be at least 32 characters/,
      );
    });

    it("accepts 32 characters", () => {
      expect(validateEnv({ ...required, JWT_SECRET: "a".repeat(32) }).JWT_SECRET).toHaveLength(32);
    });
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

describe("throttleConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["true", true],
    ["false", false],
    ["", true],
  ])("reads THROTTLE_ENABLED=%j as enabled: %s", (value, enabled) => {
    for (const [name, requiredValue] of Object.entries(required)) {
      vi.stubEnv(name, requiredValue);
    }
    vi.stubEnv("THROTTLE_ENABLED", value);

    expect(throttleConfig().enabled).toBe(enabled);
  });
});
