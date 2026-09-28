import { Module } from "@nestjs/common";

import { UsersModule } from "../users/users.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { JwtAuthGuard } from "./guards/jwt-auth.guard.js";

@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  imports: [UsersModule],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
