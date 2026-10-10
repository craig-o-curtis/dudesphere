import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { PaginationModule } from "../shared/pagination/pagination.module.js";
import { User } from "../users/user.entity.js";
import { Profile } from "./profile.entity.js";
import { ProfilesController } from "./profiles.controller.js";
import { ProfilesSeedService } from "./profiles.seed.js";
import { ProfilesService } from "./profiles.service.js";

@Module({
  imports: [TypeOrmModule.forFeature([Profile, User]), PaginationModule],
  controllers: [ProfilesController],
  providers: [ProfilesService, ProfilesSeedService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
