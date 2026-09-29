import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import * as dotenv from "dotenv";
import * as path from "path";
import * as process from "process";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { AppModule } from "../../app.module.js";
import { ConfigService } from "@nestjs/config";
import { ProfilesSeedService } from "../../profile/profiles.seed.js";
import { UsersSeedService } from "../../users/users.seed.js";
import { AbidingSeedService } from "./abiding.seed.js";

async function runSeeds() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const configService = app.get(ConfigService);
  const adminEmail = configService.get<string>("EMAIL");
  const adminPassword = configService.get<string>("PASSWORD");
  const nodeEnv = configService.get<string>("NODE_ENV") ?? "development";

  if (!adminEmail || !adminPassword) {
    console.error("EMAIL and PASSWORD must be set in .env");
    process.exit(1);
  }

  try {
    // Run PostgreSQL seeds (User and Profile)
    const usersSeed = app.get(UsersSeedService);
    await usersSeed.seed(adminEmail, adminPassword);

    const profilesSeed = app.get(ProfilesSeedService);
    await profilesSeed.seed(adminEmail);

    // Run MongoDB seed (Abiding)
    const abidingSeed = app.get(AbidingSeedService);
    await abidingSeed.seed(nodeEnv, adminEmail);

    console.log("All seeds completed successfully!");
  } catch (error) {
    console.error("Error running seeds:", error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

runSeeds();