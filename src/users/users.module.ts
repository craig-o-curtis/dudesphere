import { forwardRef, Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
  imports: [forwardRef(() => AuthModule)], // forwardRef to avoid circular dependency, it works by delaying the evaluation of the module
})
export class UsersModule {}
