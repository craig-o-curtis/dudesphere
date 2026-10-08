import { plainToInstance, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  validateSync,
} from "class-validator";

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

  // Env values arrive as strings. @Type converts before @IsInt runs, as the
  // query DTOs do.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  PG_HOST: string;

  @Type(() => Number)
  @IsInt()
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

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  DUDE_OBSERVE_APP_KEY: string;

  @IsString()
  @IsNotEmpty()
  DUDE_OBSERVE_APP_SECRET: string;

  // The seeded admin's login. Only `pnpm seed:run` and the e2e suite need
  // these, so the app starts without them.
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

  if (errors.length > 0) {
    const problems = errors.flatMap((error) => Object.values(error.constraints ?? {}));
    throw new Error(`Invalid environment variables:\n- ${problems.join("\n- ")}`);
  }

  return validated;
}
