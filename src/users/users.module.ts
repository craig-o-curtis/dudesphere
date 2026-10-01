import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { ProfileModule } from "../profile/profile.module.js";
import { User } from "./user.entity.js";
import { UsersController } from "./users.controller.js";
import { UsersSeedService } from "./users.seed.js";
import { UsersService } from "./users.service.js";

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([User]), ProfileModule],
  controllers: [UsersController],
  providers: [UsersService, UsersSeedService],
  exports: [UsersService],
})
export class UsersModule {}
