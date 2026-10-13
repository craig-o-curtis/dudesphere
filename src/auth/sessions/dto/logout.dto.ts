import { IsNotEmpty, IsString, MaxLength } from "class-validator";

/**
 * The body of POST /auth/logout: a refresh token of the session to end.
 *
 * The same one field as RefreshDto, with the same rules. It is a class of
 * its own so each route's body has its own name.
 */
export class LogoutDto {
  // No rule about its shape, as in RefreshDto. A value that is not a token
  // we issued ends nothing, and the route answers 204 all the same.
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  refreshToken: string;
}
