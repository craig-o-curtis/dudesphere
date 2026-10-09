import "reflect-metadata";
import * as path from "path";

import { NestFactory } from "@nestjs/core";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { ConfigService, type ConfigType } from "@nestjs/config";

import { AppModule } from "../../app.module.js";
import appConfig from "../../config/app.config.js";
import { ProfilesSeedService } from "../../profiles/profiles.seed.js";
import { UsersSeedService } from "../../users/users.seed.js";
import { AbidingSeedService } from "./abiding.seed.js";

async function runSeeds() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const configService = app.get(ConfigService);
  const adminEmail = configService.get<string>("EMAIL");
  const adminPassword = configService.get<string>("PASSWORD");
  const { environment } = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);

  if (!adminEmail || !adminPassword) {
    console.error("EMAIL and PASSWORD must be set in .env");
    process.exitCode = 1;
    await app.close();
    return;
  }

  try {
    // Run PostgreSQL seeds (User and Profile)
    const usersSeed = app.get(UsersSeedService);
    await usersSeed.seed(adminEmail, adminPassword);

    const profilesSeed = app.get(ProfilesSeedService);
    await profilesSeed.seed(adminEmail);

    // Run MongoDB seed (Abiding)
    const abidingSeed = app.get(AbidingSeedService);
    await abidingSeed.seed(environment, adminEmail);

    console.log("All seeds completed successfully!");
  } catch (error) {
    // The message only. A failed query's error object also carries the values
    // it was run with, and for the admin row those include the password hash.
    console.error("Error running seeds:", error instanceof Error ? error.message : error);
    // exitCode rather than exit(): exit() skips the finally below and leaves
    // the connections open until the process is killed.
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

await runSeeds();
