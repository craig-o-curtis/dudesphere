// Runner for the dev token command. The logic lives in dev-token.ts, so it
// can be tested without booting the app. This file only wires up a Nest
// context and calls it, the same way backfill-hashtags.ts does.
//
// Run with: pnpm dev:token                  the admin named by EMAIL in .env
//           pnpm dev:token walter           any member, by username or email
//           pnpm dev:token | pbcopy         straight to the clipboard, on macOS
import "reflect-metadata";
import * as path from "path";

import { NestFactory } from "@nestjs/core";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import {
  AUTHENTICATION_MODULE_OPTIONS,
  type AuthenticationModuleOptions,
  JwtSigner,
} from "@nestjs/authentication";
import { ConfigService, type ConfigType } from "@nestjs/config";

import { AppModule } from "../app.module.js";
import appConfig from "../config/app.config.js";
import { UsersRepository } from "../users/users.repository.js";
import { createDevToken, DEV_TOKEN_DAYS } from "./dev-token.js";

async function printToken() {
  // Errors only. Standard output has to carry the token and nothing else, or
  // `pnpm dev:token | pbcopy` would copy Nest's start-up log with it. Nest writes
  // its errors to standard error, so a failed start is still shown.
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"] });

  try {
    const { environment } = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);
    // The same `accessToken` options AppModule gives AuthenticationModule.
    const { accessToken } = app.get<AuthenticationModuleOptions>(AUTHENTICATION_MODULE_OPTIONS);
    if (!accessToken) {
      throw new Error("AuthenticationModule has no accessToken options.");
    }
    const signer = new JwtSigner(accessToken);
    const { token, user } = await createDevToken(signer, app.get(UsersRepository), {
      environment,
      adminEmail: app.get(ConfigService).get<string>("EMAIL"),
      identifier: process.argv[2],
    });

    // console.error for the note and console.log for the token: the note goes
    // to standard error, so a pipe gets the token alone.
    console.error(
      `Token for ${user.username} (user #${user.id}, role ${user.role}). Valid for ${DEV_TOKEN_DAYS} days.`,
    );
    console.log(token);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    // exitCode rather than exit(): exit() skips the finally below and leaves
    // the connections open until the process is killed.
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

await printToken();
