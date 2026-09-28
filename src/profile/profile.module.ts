import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { User } from "../users/user.entity.js";
import { ProfileController } from "./profile.controller.js";
import { Profile } from "./profile.entity.js";
import { ProfileService } from "./profile.service.js";
import { ProfilesSeedService } from "./profiles.seed.js";

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Profile, User])],
  controllers: [ProfileController],
  providers: [ProfileService, ProfilesSeedService],
})
export class ProfileModule {}
