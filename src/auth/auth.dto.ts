import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

import { MaxCodePoints } from "../shared/decorators/max-code-points.decorator.js";
import { NoNulCharacter } from "../shared/decorators/no-nul-character.decorator.js";

// The request bodies of the /auth routes, in one file as the NestJS
// authentication docs keep them. Sign-up takes CreateUserDto from
// src/users/dto, because it creates a profile too.

function trim({ value }: { value: unknown }) {
  return typeof value === "string" ? value.trim() : value;
}

/**
 * POST /auth/token. The docs sign in with an email. Here `identifier` is a
 * username or an email, and UsersRepository.findCredentials tells them apart
 * by the "@".
 *
 * Sign-in sets no length rules on the password, as in the docs, so a
 * password set under an older rule still works. Sign-up and reset set them.
 */
export class SignInDto {
  // Trimmed first, so a space pasted around a name still signs in. The rules
  // below then check what is left. The longer of the two columns is email,
  // at 100.
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxCodePoints(100)
  @NoNulCharacter()
  identifier: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

/**
 * POST /auth/token/refresh and POST /auth/token/revoke. The docs read
 * `refreshToken` with @Body("refreshToken") and no DTO. A DTO here lets the
 * global ValidationPipe refuse a body that is not a string, or that is far
 * longer than any token the package hands out.
 */
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  refreshToken: string;
}

/** POST /auth/password/forgot. */
export class EmailDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @MaxCodePoints(100)
  email: string;
}

/**
 * POST /auth/password/reset. The token from the reset link, and the new
 * password, under the sign-up rules in CreateUserDto.
 */
export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  token: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password: string;
}
