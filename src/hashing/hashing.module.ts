import { Module } from "@nestjs/common";

import { BcryptProvider } from "./bcrypt.provider.js";
import { HashingProvider } from "./hashing.provider.js";

// A module of its own, not part of AuthModule. UsersService hashes on sign-up
// and compares on login, and AuthModule already imports UsersModule, so a
// hasher inside AuthModule would close a cycle. Any module that needs to hash
// imports this one.
@Module({
  // Nest resolves the token HashingProvider to BcryptProvider at runtime.
  // provide = the injection token (the abstract class).
  // useClass = the concrete class Nest instantiates behind it.
  // A service asks for HashingProvider; nothing in the app knows it is bcrypt.
  providers: [{ provide: HashingProvider, useClass: BcryptProvider }],
  exports: [HashingProvider],
})
export class HashingModule {}
