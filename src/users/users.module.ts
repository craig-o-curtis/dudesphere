import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AbidingModelModule } from "../abidings/abiding-model.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { User } from "./user.entity.js";
import { UsersController } from "./users.controller.js";
import { UsersSeedService } from "./users.seed.js";
import { UsersService } from "./users.service.js";

// Imports AbidingModelModule, not AbidingsModule, so UsersService can
// soft-delete and restore a user's abidings on delete and restore. Importing
// AbidingsModule directly would be circular, because AbidingsModule imports
// this module to look up usernames. See AbidingModelModule's own comment.
@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([User]), ProfilesModule, AbidingModelModule],
  controllers: [UsersController],
  providers: [UsersService, UsersSeedService],
  exports: [UsersService],
})
export class UsersModule {}
