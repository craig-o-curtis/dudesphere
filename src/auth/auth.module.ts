import { Module } from "@nestjs/common";
import { ConfigModule, type ConfigType } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";

import { MailModule } from "../mail/mail.module.js";
import { UsersModule } from "../users/users.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import authConfig from "./config/auth.config.js";
import { PasswordResetToken } from "./password-reset-token.entity.js";
import { PasswordResetService } from "./password-reset.service.js";

// Registers the "auth" config namespace. It is not global, so each module
// that injects authConfig.KEY has to import it. There are two: AuthModule,
// for PasswordResetService, and JwtModule, for the factory below. Both import
// this one constant.
//
// Not authConfig.asProvider(). That returns a ready-made set of registerAsync
// options: this same import and inject, plus a factory that hands the config
// back unchanged. It suits a module whose options are the config object
// itself. JwtModule's options are built from the config, so the factory below
// is written out. asProvider() also returns options and not a module, so it
// could not go in AuthModule's own imports for PasswordResetService.
const authConfigModule = ConfigModule.forFeature(authConfig);

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordResetService],
  imports: [
    UsersModule,
    // For PasswordResetService: the mail it sends and the table it keeps.
    MailModule,
    TypeOrmModule.forFeature([PasswordResetToken]),
    authConfigModule,
    // global: AppModule registers JwtAuthGuard as an APP_GUARD, and the guard
    // needs JwtService there. Global makes JwtService injectable in every
    // module, so nothing has to import AuthModule to get it.
    JwtModule.registerAsync({
      global: true,
      // Auth owns its own config, so it is loaded here and not in AppModule.
      // The rule for JWT_SECRET still lives in src/config/env.validate.ts,
      // which checks every variable before any module loads.
      imports: [authConfigModule],
      inject: [authConfig.KEY],
      // Set once here for signing and verifying. AuthService and JwtAuthGuard
      // then call signAsync and verifyAsync with no options of their own, and
      // the guard rejects a token with the wrong audience or issuer.
      useFactory: (auth: ConfigType<typeof authConfig>) => ({
        secret: auth.secret,
        signOptions: {
          expiresIn: auth.expiresIn,
          audience: auth.audience,
          issuer: auth.issuer,
        },
        verifyOptions: {
          audience: auth.audience,
          issuer: auth.issuer,
        },
      }),
    }),
  ],
  exports: [AuthService],
})
export class AuthModule {}
