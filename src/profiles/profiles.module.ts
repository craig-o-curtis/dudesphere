import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { User } from "../users/user.entity.js";
import { Profile } from "./profile.entity.js";
import { ProfilesController } from "./profiles.controller.js";
import { ProfilesSeedService } from "./profiles.seed.js";
import { ProfilesService } from "./profiles.service.js";

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Profile, User])],
  controllers: [ProfilesController],
  providers: [ProfilesService, ProfilesSeedService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
