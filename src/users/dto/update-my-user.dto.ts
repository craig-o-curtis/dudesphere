import { IsNotEmpty, IsString, ValidateIf } from "class-validator";

import { UpdateUserDto } from "./update-user.dto.js";

/**
 * What a signed-in user may send to PATCH /users/me.
 *
 * It is UpdateUserDto plus `currentPassword`. The admin route, PATCH
 * /users/:id, takes UpdateUserDto itself and so never asks for it.
 */
export class UpdateMyUserDto extends UpdateUserDto {
  // Needed only when the body also sets a new `password`. UsersService checks
  // that, because "required when another field is present" is a rule about
  // two fields, and it also has to compare this against the stored hash.
  // No length rule, for the reason LoginUserDto gives: a rule here that
  // differs from sign-up's would lock out users with a valid password.
  //
  // Not @IsOptional(): that also skips null, and a null here reached the
  // password hasher and came back as a 500. This skips a missing field only.
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  currentPassword?: string;
}
