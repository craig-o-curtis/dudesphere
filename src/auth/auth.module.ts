import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { UserEntity } from "../users/users.entity.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { JwtAuthGuard } from "./guards/jwt-auth.guard.js";

@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  imports: [TypeOrmModule.forFeature([UserEntity])],
  exports: [AuthService, JwtAuthGuard],
})
export class AuthModule {}
