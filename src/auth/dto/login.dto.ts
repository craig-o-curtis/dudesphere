import { Transform } from "class-transformer";
import { IsByteLength, IsNotEmpty, IsString } from "class-validator";

import { MaxCodePoints } from "../../shared/decorators/max-code-points.decorator.js";
import { NoNulCharacter } from "../../shared/decorators/no-nul-character.decorator.js";

export class LoginDto {
  // A username or an email. UsersService.getUserByCredentials decides which.
  //
  // No @IsEmail and no username rules. A value that fits neither is simply
  // not found, and gets the same 401 as a wrong password. A 400 that named
  // the rule would tell the caller more than that.
  //
  // Trimmed, so a space added by autofill does not fail the login. 100 is the
  // longer of the two columns, email's.
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxCodePoints(100)
  @NoNulCharacter()
  identifier: string;

  // No minimum length here. Sign-up decides what a valid password is; a
  // minimum here that differs from it locks out users with a valid password.
  // The seed and an admin's update do not go through sign-up's minimum at all.
  //
  // The 72-byte maximum is safe: BcryptProvider.hashPassword refuses anything
  // longer, so no stored password can be longer. BcryptProvider.comparePassword
  // answers false for a longer one as well. The rule here turns that into a 400
  // that says why, before any hashing work is done.
  @IsString()
  @IsNotEmpty()
  @IsByteLength(0, 72, {
    message: "password is too long: at most 72 letters or digits, fewer with accents or emoji",
  })
  password: string;
}
