import { Module } from "@nestjs/common";
import { ConfigModule, type ConfigType } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

import { UsersModule } from "../users/users.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import authConfig from "./config/auth.config.js";
import { JwtAuthGuard } from "./guards/jwt-auth.guard.js";

// Registers the "auth" config namespace. It is not global, so each module
// that injects authConfig.KEY has to import it: AuthModule for its own
// providers, and JwtModule for the factory below.
const authConfigModule = ConfigModule.forFeature(authConfig);

@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  imports: [
    UsersModule,
    authConfigModule,
    // global: JwtAuthGuard needs JwtService in whichever feature uses the
    // guard, and those features can't import AuthModule (see the guard).
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
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
