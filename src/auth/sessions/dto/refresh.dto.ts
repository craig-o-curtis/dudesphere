import { IsNotEmpty, IsString, MaxLength } from "class-validator";

/** The body of POST /auth/refresh: the refresh token to swap for a new pair. */
export class RefreshDto {
  // No rule about its shape. A value that is not a token we issued is simply
  // not found, and gets the same 401 as a used or expired one. A 400 that
  // named the shape would tell the caller more than that.
  //
  // 1000 is far above the 43 characters a real token has, and keeps a huge
  // value out of the app. It is also above the length of an access token, on
  // purpose: a client that sends the wrong one of its two tokens gets the
  // same 401 as for any other token that cannot be swapped.
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  refreshToken: string;
}
