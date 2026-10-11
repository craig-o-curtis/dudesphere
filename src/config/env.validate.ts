import { plainToInstance } from "class-transformer";
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from "class-validator";

import { IntFromDigits } from "../shared/decorators/int-from-digits.decorator.js";

const ENVIRONMENTS = ["development", "staging", "production", "test"] as const;

/**
 * Every environment variable the app reads, with its type, its rules and its
 * default. This is the one place a variable is parsed, so a config file never
 * calls Number() or falls back to a default of its own.
 *
 * A property with an initializer is optional and that value is its default. A
 * property without one is required.
 */
export class EnvironmentVariables {
  @IsIn(ENVIRONMENTS)
  NODE_ENV: (typeof ENVIRONMENTS)[number] = "development";

  // Env values arrive as strings. @IntFromDigits converts before the checks
  // run, as the query DTOs do. It accepts plain digits only, so PORT=0x10
  // stops the app at startup and is not read as 16.
  @IntFromDigits()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  PG_HOST: string;

  @IntFromDigits()
  @Min(1)
  @Max(65535)
  PG_PORT: number;

  @IsString()
  @IsNotEmpty()
  PG_ADMIN_USER: string;

  @IsString()
  @IsNotEmpty()
  PG_ADMIN_PW: string;

  @IsString()
  @IsNotEmpty()
  PG_DATABASE: string;

  @Matches(/^mongodb(\+srv)?:\/\//, {
    message: "MONGO_URI must start with mongodb:// or mongodb+srv://",
  })
  MONGO_URI: string = "mongodb://localhost:27017/dude-abidings";

  // The key that signs every access token. Whoever holds it can sign a token
  // for any member, so it must be too long to guess. Anyone with one real
  // token can try keys against it on their own machine, as fast as they like,
  // and a short or common key falls to that. 32 characters is the key size
  // HS256 calls for (RFC 7518, section 3.2).
  @IsString()
  @IsNotEmpty()
  @MinLength(32, {
    message: "JWT_SECRET must be at least 32 characters. Make one with: openssl rand -base64 48",
  })
  JWT_SECRET: string;

  // How long an access token lasts, in seconds. 15 minutes. Short, because
  // it is the one token that is sent with every request. A client gets a new
  // one with its refresh token, so the member never notices.
  @IntFromDigits()
  @Min(1)
  JWT_EXPIRES_IN: number = 900;

  // How long one refresh token lasts, in seconds. 7 days. Each use hands out
  // a new one with a new 7 days, so a member who comes back within a week
  // stays signed in. At least a minute, so a typo cannot sign everyone out.
  @IntFromDigits()
  @Min(60)
  REFRESH_TOKEN_EXPIRES_IN: number = 604800;

  // How long a session lasts at most, in seconds, however often it is
  // renewed. 30 days. After that the member signs in again. validateEnv
  // below refuses a value shorter than REFRESH_TOKEN_EXPIRES_IN.
  @IntFromDigits()
  @Min(60)
  SESSION_EXPIRES_IN: number = 2592000;

  // Who a token is for, and who issued it. Both are written into every token
  // and checked on every request, so a token made for another app is rejected
  // even if it was signed with the same secret.
  @IsString()
  @IsNotEmpty()
  JWT_AUDIENCE: string = "dudesphere-api";

  @IsString()
  @IsNotEmpty()
  JWT_ISSUER: string = "dudesphere";

  // Rate limiting. On unless this is "false". The e2e suite turns it off,
  // because its files sign up and log in from one address far faster than a
  // person would. See src/shared/guards/auth-throttler.guard.ts.
  @IsIn(["true", "false"])
  THROTTLE_ENABLED: "true" | "false" = "true";

  // Outgoing email, sent over SMTP. The defaults point at the Mailpit
  // container in docker-compose.yml, which keeps every message and delivers
  // none, so the app sends no real mail until these are changed.
  @IsString()
  @IsNotEmpty()
  MAIL_HOST: string = "localhost";

  @IntFromDigits()
  @Min(1)
  @Max(65535)
  MAIL_PORT: number = 1025;

  // The SMTP login. Mailpit needs none, so both are optional.
  @IsOptional()
  @IsString()
  MAIL_USER?: string;

  @IsOptional()
  @IsString()
  MAIL_PASSWORD?: string;

  // Who every email is from: an address, or "Name <address>".
  @IsString()
  @IsNotEmpty()
  MAIL_FROM: string = "Dudesphere <no-reply@dudesphere.local>";

  // Where the web app is served. The password reset email links to
  // /reset-password on it. require_tld is off so localhost passes.
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ["http", "https"] })
  FRONTEND_URL: string = "http://localhost:3000";

  // How long a password reset link works, in seconds. At least a minute, so
  // a typo cannot make every link dead on arrival.
  @IntFromDigits()
  @Min(60)
  PASSWORD_RESET_EXPIRES_IN: number = 1800;

  @IsString()
  @IsNotEmpty()
  DUDE_OBSERVE_APP_KEY: string;

  @IsString()
  @IsNotEmpty()
  DUDE_OBSERVE_APP_SECRET: string;

  // The seeded admin's login. `pnpm seed:run` reads both, and
  // `pnpm dev:token` reads EMAIL. Nothing else does, so the app starts
  // without them.
  @IsOptional()
  @IsString()
  EMAIL?: string;

  @IsOptional()
  @IsString()
  PASSWORD?: string;
}

/**
 * Checks the environment and returns it typed, with defaults filled in.
 *
 * ConfigModule.forRoot({ validate: validateEnv }) calls this once at startup, so the app
 * refuses to start on a missing or malformed value. Each config file calls it
 * again to read its own variables: the ones in this folder, and a feature's
 * own, such as src/auth/config/auth.config.ts.
 */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  // An empty value means "not set". `.env.example` ships lines like PORT='',
  // and without this Number('') made the app listen on port 0.
  const present = Object.fromEntries(Object.entries(config).filter(([, value]) => value !== ""));
  // Object.fromEntries does the following:
  //   [["PORT", "3000"], ["HOST", "localhost"]]  ->  { PORT: "3000", HOST: "localhost" }
  // It turns a list of [key, value] pairs back into an object.

  // Object.entries does the following:
  //   { PORT: "3000", HOST: "" }  ->  [["PORT", "3000"], ["HOST", ""]]
  // It turns an object into a list of [key, value] pairs, so we can filter them.

  // so Object.fromEntries(Object.entries()) does the following:
  //   { PORT: "3000", HOST: "" }  ->  { PORT: "3000", HOST: "" }
  // On its own it gives back a copy of the same object. The filter in between
  // is what changes it, by dropping the empty values:
  //   { PORT: "3000", HOST: "" }  ->  { PORT: "3000" }

  const validated = plainToInstance(EnvironmentVariables, present);
  const errors = validateSync(validated, { skipMissingProperties: false });

  const problems = errors.flatMap((error) => Object.values(error.constraints ?? {}));

  // A rule between two variables, which a decorator on one field cannot
  // state. A refresh token never outlives its session, so a session shorter
  // than one refresh token would quietly cut every token short. Checked only
  // when both are numbers; otherwise the errors above already name them.
  if (errors.length === 0 && validated.SESSION_EXPIRES_IN < validated.REFRESH_TOKEN_EXPIRES_IN) {
    problems.push("SESSION_EXPIRES_IN must not be less than REFRESH_TOKEN_EXPIRES_IN");
  }

  if (problems.length > 0) {
    throw new Error(`Invalid environment variables:\n- ${problems.join("\n- ")}`);
  }

  return validated;
}
