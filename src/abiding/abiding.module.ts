import { Module } from "@nestjs/common";

import { AbidingSeedService } from "../database/seeds/abiding.seed.js";
import { UsersModule } from "../users/users.module.js";
import { AbidingModelModule } from "./abiding-model.module.js";
import { AbidingController } from "./abiding.controller.js";
import { AbidingService } from "./abiding.service.js";

@Module({
  controllers: [AbidingController],
  providers: [AbidingService, AbidingSeedService],
  imports: [UsersModule, AbidingModelModule],
})
export class AbidingModule {}
