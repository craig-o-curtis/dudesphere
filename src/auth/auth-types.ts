import type { User } from "../users/user.entity.js";

// Tells @nestjs/authentication what a signed-in user is, once, for the whole
// app. @CurrentUser("key") then accepts only keys of User, and
// AuthenticationContext.user is typed too. The parameter itself still needs
// its `user: User` annotation. See "Read the current user" on
// https://docs.nestjs.com/security/authentication.
//
// The user is the one JwtAuth.validate loads, without the password hash.
declare module "@nestjs/authentication" {
  interface AuthenticationTypes {
    user: User;
  }
}
