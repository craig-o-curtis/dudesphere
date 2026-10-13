import { Injectable, UnauthorizedException } from "@nestjs/common";

import { ErrorCode } from "../shared/error-codes.js";
import { CreateUserDto } from "../users/dto/create-user.dto.js";
import { UsersService } from "../users/users.service.js";
import { LoginDto } from "./sessions/dto/login.dto.js";
import { type TokenPair, SessionsService } from "./sessions/sessions.service.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
  ) {}

  async signup(signupDto: CreateUserDto) {
    // prevent dupes happens inside the usersService.createUser method
    return await this.usersService.createUser(signupDto);
  }

  // Logs a member in: checks who they are, starts a session, and returns
  // its first pair of tokens. Three steps.
  //
  // 1. Is this the member, and is that their password? UsersService decides.
  // 2. SessionsService starts the session and makes the tokens.
  // 3. Is what step 1 checked still true? Checking a password takes about a
  //    tenth of a second, on purpose. If the password was changed or the
  //    account closed in that time, the change ended the member's sessions
  //    before this one existed, and this one would outlive it. So the
  //    session is ended here, and the caller gets the same 401 as for a
  //    wrong password. See UsersService.credentialsStillHold.
  async login(loginDto: LoginDto): Promise<TokenPair> {
    const checked = await this.usersService.getUserByCredentials(
      loginDto.identifier,
      loginDto.password,
    );
    if (!checked) {
      throw this.badCredentials();
    }

    const pair = await this.sessionsService.start(checked.user);

    const stillHold = await this.usersService.credentialsStillHold(
      checked.user.id,
      checked.passwordHash,
    );
    if (!stillHold) {
      await this.sessionsService.end(pair.refreshToken);
      throw this.badCredentials();
    }

    return pair;
  }

  // One message for every case, so the response doesn't reveal which
  // usernames and emails have an account.
  private badCredentials(): UnauthorizedException {
    return new UnauthorizedException("Invalid username, email or password", {
      errorCode: ErrorCode.BAD_CREDENTIALS,
    });
  }
}
