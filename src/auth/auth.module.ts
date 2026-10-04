import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";

import { UsersModule } from "../users/users.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { JwtAuthGuard } from "./guards/jwt-auth.guard.js";

@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  imports: [
    UsersModule,
    // global: JwtAuthGuard needs JwtService in whichever feature uses the
    // guard, and those features can't import AuthModule (see the guard).
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: { expiresIn: "1h" },
      }),
    }),
  ],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
