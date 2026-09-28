import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { User } from "./user.entity.js";
import { UsersController } from "./users.controller.js";
import { UsersSeedService } from "./users.seed.js";
import { UsersService } from "./users.service.js";

@Module({
  controllers: [UsersController],
  providers: [UsersService, UsersSeedService],
  exports: [UsersService],
  imports: [ConfigModule, TypeOrmModule.forFeature([User])],
})
export class UsersModule {}
