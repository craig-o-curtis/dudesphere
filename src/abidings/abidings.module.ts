import { Module } from "@nestjs/common";

import { AbidingSeedService } from "../database/seeds/abiding.seed.js";
import { HashtagBackfillService } from "../database/seeds/hashtag-backfill.seed.js";
import { HashtagsModule } from "../hashtags/hashtags.module.js";
import { PaginationModule } from "../shared/pagination/pagination.module.js";
import { UsersModule } from "../users/users.module.js";
import { AbidingsController } from "./abidings.controller.js";
import { AbidingsService } from "./abidings.service.js";
import { UserAbidingsModule } from "./user-abidings.module.js";

// Imports UserAbidingsModule rather than registering the Abiding model
// itself, so the model is only wired up in one place. See
// UserAbidingsModule's own comment: UsersModule imports that same module,
// which keeps this module and UsersModule from importing each other.
@Module({
  controllers: [AbidingsController],
  providers: [AbidingsService, AbidingSeedService, HashtagBackfillService],
  imports: [UsersModule, UserAbidingsModule, HashtagsModule, PaginationModule],
})
export class AbidingsModule {}
