import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { UserAbidingsModule } from "../abidings/user-abidings.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { PaginationModule } from "../shared/pagination/pagination.module.js";
import { User } from "./user.entity.js";
import { UserPolicy } from "./user.policy.js";
import { UsersController } from "./users.controller.js";
import { UsersRepository } from "./users.repository.js";
import { UsersSeedService } from "./users.seed.js";
import { UsersService } from "./users.service.js";

// Imports UserAbidingsModule, not AbidingsModule, so UsersService can
// soft-delete and restore a user's abidings on delete and restore. It needs
// the Abiding model and that one service, and none of the abiding routes.
// See UserAbidingsModule's own comment.
//
// UsersService hashes passwords with PasswordHasher, and ends a member's
// sign-ins with SessionService and TokenService. All three come from
// AuthenticationModule, which is global, so nothing is imported for them.
@Module({
  imports: [TypeOrmModule.forFeature([User]), ProfilesModule, UserAbidingsModule, PaginationModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository, UsersSeedService, UserPolicy],
  exports: [UsersService, UsersRepository],
})
export class UsersModule {}
