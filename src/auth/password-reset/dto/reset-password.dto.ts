import { IsByteLength, IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

import { SameAs } from "../../../shared/decorators/same-as.decorator.js";

export class ResetPasswordDto {
  // From the link in the reset email. The token says whose password this is,
  // which is why there is no email field: with one, anybody could name
  // somebody else's account.
  //
  // No rule about its shape. A token that is not one we issued is simply not
  // found, and gets the same 400 as an expired one. 200 is far above the 43
  // characters a real token has, and keeps a huge value out of the hasher.
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token: string;

  // The same rules as a password at sign-up. See CreateUserDto.
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @IsByteLength(0, 72, {
    message: "password is too long: at most 72 letters or digits, fewer with accents or emoji",
  })
  password: string;

  // Typed twice so a slip is caught before the old password is gone.
  @IsString()
  @IsNotEmpty()
  @SameAs("password")
  confirmPassword: string;
}
