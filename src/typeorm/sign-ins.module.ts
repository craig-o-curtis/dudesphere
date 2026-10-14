import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { EmailTokenEntity, RefreshTokenEntity, SessionEntity } from "./authentication.entities.js";
import { SignInsRepository } from "./sign-ins.repository.js";

// SignInsRepository, for AuthModule and UsersModule both. It imports no app
// module, so neither import makes a cycle.
//
// It also registers the sign-in tables with the app's one connection, which
// loads them through autoLoadEntities.
@Module({
  imports: [TypeOrmModule.forFeature([SessionEntity, RefreshTokenEntity, EmailTokenEntity])],
  providers: [SignInsRepository],
  exports: [SignInsRepository],
})
export class SignInsModule {}
