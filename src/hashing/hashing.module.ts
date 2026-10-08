import { Module } from "@nestjs/common";

import { BcryptProvider } from "./bcrypt.provider.js";
import { HashingProvider } from "./hashing.provider.js";

// A module of its own, not part of AuthModule. UsersService hashes on sign-up
// and compares on login, and AuthModule already imports UsersModule, so a
// hasher inside AuthModule would close a cycle. Any module that needs to hash
// imports this one.
@Module({
  providers: [{ provide: HashingProvider, useClass: BcryptProvider }],
  exports: [HashingProvider],
})
export class HashingModule {}
