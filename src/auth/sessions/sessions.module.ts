import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import authConfig from "../config/auth.config.js";
import { RefreshToken } from "./refresh-token.entity.js";
import { Session } from "./session.entity.js";
import { SessionsRepository } from "./sessions.repository.js";
import { SessionsService } from "./sessions.service.js";

// Everything about sessions: the two tables, the queries on them, and the
// rules. SessionsService is the one thing it exports, so the rest of the app
// has one door in.
//
// Three modules come through that door:
//
// - AuthModule, where login, refresh and logout call SessionsService.
// - UsersModule, where UsersService ends a member's sessions when their
//   password changes or their account is closed.
// - AppModule, where JwtAuthGuard asks on every request whether the caller's
//   session is still going.
//
// This module imports none of those three back, and that is what keeps the
// imports from going in a circle. AuthModule imports UsersModule, and
// UsersModule imports this one. If this one imported UsersModule to read a
// member's name, the two would import each other. So SessionsRepository
// reads the name through the session's own link to the user, in the same
// query that finds the token.
//
// JwtService is not imported here either. AuthModule registers JwtModule as
// global, so it can be injected in every module.
@Module({
  imports: [
    TypeOrmModule.forFeature([Session, RefreshToken]),
    // SessionsService reads the token lifetimes from the "auth" config. The
    // namespace is not global, so each module that injects it imports it.
    ConfigModule.forFeature(authConfig),
  ],
  providers: [SessionsService, SessionsRepository],
  exports: [SessionsService],
})
export class SessionsModule {}
