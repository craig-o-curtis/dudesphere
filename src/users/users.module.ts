import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { UserAbidingsModule } from "../abidings/user-abidings.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { User } from "./user.entity.js";
import { UsersController } from "./users.controller.js";
import { UsersSeedService } from "./users.seed.js";
import { UsersService } from "./users.service.js";

// Imports UserAbidingsModule, not AbidingsModule, so UsersService can
// soft-delete and restore a user's abidings on delete and restore. Importing
// AbidingsModule directly would be circular, because AbidingsModule imports
// this module to look up usernames. See UserAbidingsModule's own comment.
@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([User]), ProfilesModule, UserAbidingsModule],
  controllers: [UsersController],
  providers: [UsersService, UsersSeedService],
  exports: [UsersService],
})
export class UsersModule {}
