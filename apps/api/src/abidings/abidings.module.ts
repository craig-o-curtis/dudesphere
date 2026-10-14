import { Module } from "@nestjs/common";

import { AbidingSeedService } from "../database/seeds/abiding.seed.js";
import { HashtagBackfillService } from "../database/seeds/hashtag-backfill.seed.js";
import { HashtagsModule } from "../hashtags/hashtags.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { PaginationModule } from "../shared/pagination/pagination.module.js";
import { AbidingsController } from "./abidings.controller.js";
import { AbidingsService } from "./abidings.service.js";
import { UserAbidingsModule } from "./user-abidings.module.js";

// Imports UserAbidingsModule rather than registering the Abiding model
// itself, so the model is only wired up in one place. UsersModule imports
// that same module.
//
// Imports ProfilesModule for the author's display name on each abiding. It
// does not import UsersModule: nothing here reads a user.
@Module({
  controllers: [AbidingsController],
  providers: [AbidingsService, AbidingSeedService, HashtagBackfillService],
  imports: [ProfilesModule, UserAbidingsModule, HashtagsModule, PaginationModule],
})
export class AbidingsModule {}
