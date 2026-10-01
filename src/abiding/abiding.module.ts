import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { AbidingSeedService } from "../database/seeds/abiding.seed.js";
import { UsersModule } from "../users/users.module.js";
import { AbidingController } from "./abiding.controller.js";
import { Abiding, AbidingSchema } from "./abiding.schema.js";
import { AbidingService } from "./abiding.service.js";

@Module({
  controllers: [AbidingController],
  providers: [AbidingService, AbidingSeedService],
  imports: [
    UsersModule,
    MongooseModule.forFeature([{ name: Abiding.name, schema: AbidingSchema }]),
  ],
})
export class AbidingModule {}
