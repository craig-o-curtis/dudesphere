import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Profile } from "../profile/profile.entity.js";
import { User } from "./user.entity.js";
import { UsersController } from "./users.controller.js";
import { UsersSeedService } from "./users.seed.js";
import { UsersService } from "./users.service.js";

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersSeedService],
  exports: [UsersService],
  imports: [ConfigModule, TypeOrmModule.forFeature([User, Profile])],
})
export class UsersModule {}
