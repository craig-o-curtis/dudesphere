import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { UserAbidingsModule } from "../abidings/user-abidings.module.js";
import { RefreshTokensModule } from "../auth/sessions/refresh-tokens.module.js";
import { HashingModule } from "../hashing/hashing.module.js";
import { ProfilesModule } from "../profiles/profiles.module.js";
import { PaginationModule } from "../shared/pagination/pagination.module.js";
import { User } from "./user.entity.js";
import { UsersController } from "./users.controller.js";
import { UsersSeedService } from "./users.seed.js";
import { UsersService } from "./users.service.js";

// Imports UserAbidingsModule, not AbidingsModule, so UsersService can
// soft-delete and restore a user's abidings on delete and restore. It needs
// the Abiding model and that one service, and none of the abiding routes.
// See UserAbidingsModule's own comment.
//
// Imports RefreshTokensModule, not AuthModule, for the same kind of reason.
// UsersService ends a member's sessions when their password changes or their
// account is closed, and AuthModule imports this module, so importing it back
// would be a cycle.
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    ProfilesModule,
    UserAbidingsModule,
    HashingModule,
    PaginationModule,
    RefreshTokensModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, UsersSeedService],
  exports: [UsersService],
})
export class UsersModule {}
