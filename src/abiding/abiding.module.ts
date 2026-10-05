import { Module } from "@nestjs/common";

import { AbidingSeedService } from "../database/seeds/abiding.seed.js";
import { UsersModule } from "../users/users.module.js";
import { AbidingModelModule } from "./abiding-model.module.js";
import { AbidingController } from "./abiding.controller.js";
import { AbidingService } from "./abiding.service.js";

// Imports AbidingModelModule rather than registering the Abiding model
// itself, so the model is only wired up in one place. See
// AbidingModelModule's own comment: UsersModule imports that same module,
// which keeps this module and UsersModule from importing each other.
@Module({
  controllers: [AbidingController],
  providers: [AbidingService, AbidingSeedService],
  imports: [UsersModule, AbidingModelModule],
})
export class AbidingModule {}
