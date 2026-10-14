import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { MailModule } from "../mail/mail.module.js";
import {
  EmailTokenEntity,
  RefreshTokenEntity,
  SessionEntity,
} from "../typeorm/authentication.entities.js";
import { TypeOrmAuthenticationStore } from "../typeorm/typeorm-authentication.store.js";
import { UsersModule } from "../users/users.module.js";
import { AuthController } from "./auth.controller.js";
import authConfig from "./config/auth.config.js";
import { CredentialsService } from "./credentials.service.js";
import { JwtAuth } from "./jwt-auth.provider.js";
import { PasswordResetController } from "./password-reset.controller.js";
import { PasswordResetMailer } from "./password-reset.mailer.js";
import { SessionsController } from "./sessions.controller.js";
import { TokensController } from "./tokens.controller.js";

// Everything the app adds to @nestjs/authentication: the routes, the
// credential provider, the password check, the reset mailer and the store.
// AuthenticationModule itself, with its options, is registered in AppModule,
// as the docs do.
//
// JwtAuth, PasswordResetMailer and TypeOrmAuthenticationStore register
// themselves with the package from their constructors, so listing them here
// is all they need.
@Module({
  imports: [
    UsersModule,
    MailModule,
    ConfigModule.forFeature(authConfig),
    // Registers the store's entities with the app's one connection, which
    // loads them through autoLoadEntities.
    TypeOrmModule.forFeature([SessionEntity, RefreshTokenEntity, EmailTokenEntity]),
  ],
  controllers: [AuthController, PasswordResetController, TokensController, SessionsController],
  providers: [JwtAuth, CredentialsService, PasswordResetMailer, TypeOrmAuthenticationStore],
})
export class AuthModule {}
