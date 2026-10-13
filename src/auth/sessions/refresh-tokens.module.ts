import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { RefreshToken } from "./refresh-token.entity.js";
import { RefreshTokensService } from "./refresh-tokens.service.js";

// Holds only the refresh_token table and the service that reads and writes
// it. It depends on TypeORM and nothing else, so three modules can import it
// without a cycle:
//
// - AuthModule, where SessionsService starts and refreshes sessions.
// - UsersModule, where UsersService ends a member's sessions when their
//   password changes or their account is closed.
// - AppModule, where JwtAuthGuard checks on every request that the caller's
//   session is still live.
//
// AuthModule imports UsersModule, so UsersModule could not import AuthModule
// to get at this. The same split as UserAbidingsModule, for the same reason.
@Module({
  imports: [TypeOrmModule.forFeature([RefreshToken])],
  providers: [RefreshTokensService],
  exports: [RefreshTokensService],
})
export class RefreshTokensModule {}
