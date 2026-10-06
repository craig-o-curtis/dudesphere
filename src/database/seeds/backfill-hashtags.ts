// Runner for the hashtag backfill. The logic lives in
// HashtagBackfillService, so it can be tested without booting the app — this
// file only wires up a Nest context and calls it, the same way run-seeds.ts
// does for the seed services.
//
// Run with: pnpm backfill:hashtags
import "reflect-metadata";
import * as path from "path";
import * as process from "process";

import { NestFactory } from "@nestjs/core";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import { AppModule } from "../../app.module.js";
import { HashtagBackfillService } from "./hashtag-backfill.seed.js";

async function runBackfill() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const { abidings, tags } = await app.get(HashtagBackfillService).backfill();

    console.log(`Backfilled hashtags on ${abidings} abidings, registered ${tags} tags`);
  } catch (error) {
    console.error("Error backfilling hashtags:", error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

await runBackfill();
