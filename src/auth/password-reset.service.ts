import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { addUtc, getUtcNow } from "@northguild/gmt";
import { Repository } from "typeorm";

import { MailProvider } from "../mail/mail.provider.js";
import { ErrorCode } from "../shared/error-codes.js";
import { ResetTokenInvalidException } from "../shared/exceptions/reset-token-invalid.exception.js";
import { UsersService } from "../users/users.service.js";
import authConfig from "./config/auth.config.js";
import { hashOf, newOneTimeToken } from "./one-time-token.js";
import { PasswordResetToken } from "./password-reset-token.entity.js";

/**
 * Forgot password: emails a link, and later swaps the link's token for a new
 * password.
 *
 * The rules that keep it safe:
 * - requestEmail() answers the same way whether or not the email has an
 *   account.
 * - The database holds a hash of the token, never the token.
 * - A link works once, and only until it expires.
 * - Asking again kills the earlier link.
 * - Every refused token gets one answer, whatever was wrong with it.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly pwResetTokenRepository: Repository<PasswordResetToken>,
    // @Inject names these two tokens outright. `pnpm seed:run` starts the
    // whole app through tsx, which does not emit the constructor types Nest
    // otherwise reads. With @Inject on the first and last parameters only,
    // Nest sees two gaps between them there and refuses to start.
    @Inject(UsersService)
    private readonly usersService: UsersService,
    @Inject(MailProvider)
    private readonly mailProvider: MailProvider,
    // authConfig.KEY is not a secret. It is the name Nest gives the "auth"
    // config object, used here to ask for it. This service reads two values
    // from it: frontendUrl and passwordResetExpiresIn. The reset token is
    // random and is not signed, so JWT_SECRET plays no part in it.
    @Inject(authConfig.KEY) private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  /**
   * Emails a reset link to `email`, if a live user has it.
   *
   * It never rejects. The controller starts this and does not wait for it, so
   * the response is as fast for an unknown email as for a known one. A failure
   * therefore has nobody to be thrown to and is logged here.
   */
  async requestEmail(email: string): Promise<void> {
    try {
      await this.sendLink(email);
    } catch (error) {
      // What kind of failure it was, never its message. A mail server's
      // refusal can quote the address it refused, and the address is kept out
      // of the log on purpose.
      this.logger.error(`Could not send a password reset link: ${failureKind(error)}`);
    }
  }

  private async sendLink(email: string): Promise<void> {
    // Not found for an unknown email and for a soft-deleted user alike.
    const user = await this.usersService.getUserByEmail(email);
    if (!user) {
      return;
    }

    // getUtcNow and addUtc return "" on failure. See CLOCK_UNAVAILABLE in
    // src/shared/error-codes.ts.
    const now = getUtcNow();
    const expiresAt = now ? addUtc(now, { seconds: this.auth.passwordResetExpiresIn }) : "";
    if (!expiresAt) {
      throw new ServiceUnavailableException("Could not read the current UTC time", {
        errorCode: ErrorCode.CLOCK_UNAVAILABLE,
      });
    }

    // Housekeeping, with no scheduler: every request clears the links nobody
    // used in time, and this user's earlier links, so only the newest works.
    await this.pwResetTokenRepository
      .createQueryBuilder()
      .delete()
      .where(`"expiresAt" <= CURRENT_TIMESTAMP OR "userId" = :userId`, { userId: user.id })
      .execute();

    // 32 random bytes, written as 43 URL-safe characters. The token carries
    // no data and no signature.
    const token = newOneTimeToken();
    await this.pwResetTokenRepository.insert({
      userId: user.id,
      tokenHash: hashOf(token),
      expiresAt,
    });

    // The address on the account, not the one that was typed: the two can
    // differ in case, and the account's is the one its owner chose.
    await this.mailProvider.send({
      to: user.email,
      subject: "Reset your Dudesphere password",
      text: this.emailText(user.username, this.linkFor(token)),
    });
  }

  /**
   * Sets a new password for the user the token was issued to.
   *
   * Throws 400 RESET_TOKEN_INVALID for a token that is wrong, used or
   * expired. It is one answer for all three: telling them apart would only
   * help someone trying tokens.
   */
  async reset(token: string, password: string): Promise<void> {
    const userId = await this.consume(token);
    const changed = userId !== undefined && (await this.setPassword(userId, password));
    if (!changed) {
      throw new ResetTokenInvalidException();
    }
    // Any other link issued to this user dies with the one just used.
    await this.pwResetTokenRepository.delete({ userId });
  }

  // Deletes the token's row and returns whose it was, in one statement. A
  // token is used by being deleted, so it can never be used twice, and two
  // requests with the same token cannot both get a row back.
  //
  // "Now" here is the database's clock. expiresAt was set from the app's
  // clock, in sendLink. If the two hosts disagree about the time, a link
  // lives that much longer or shorter than PASSWORD_RESET_EXPIRES_IN.
  private async consume(token: string): Promise<number | undefined> {
    const result = await this.pwResetTokenRepository
      .createQueryBuilder()
      .delete()
      .where(`"tokenHash" = :tokenHash AND "expiresAt" > CURRENT_TIMESTAMP`, {
        tokenHash: hashOf(token),
      })
      .returning(`"userId"`)
      .execute();

    const [row] = result.raw as { userId: number }[];
    return row?.userId;
  }

  // Through UsersService.updateUser, the one place a password is hashed and
  // stored after sign-up. False when the user was deleted after the link was
  // sent, which the caller treats as one more link that no longer works.
  private async setPassword(userId: number, password: string): Promise<boolean> {
    try {
      await this.usersService.updateUser(userId, { password });
      return true;
    } catch (error) {
      if (error instanceof NotFoundException) {
        return false;
      }
      throw error;
    }
  }

  // The page of the web app that asks for the new password. It reads the
  // token from the URL and posts it to POST /auth/reset-password.
  private linkFor(token: string): string {
    const link = new URL("/reset-password", this.auth.frontendUrl);
    link.searchParams.set("token", token);
    return link.toString();
  }

  // Plain text only. An HTML body would have to escape the username, and a
  // mail app turns the link into something to click either way.
  private emailText(username: string, link: string): string {
    const minutes = Math.round(this.auth.passwordResetExpiresIn / 60);
    return [
      `Hi ${username},`,
      "",
      "Someone asked to reset the password for your Dudesphere account. If that was you, open this link to choose a new one:",
      "",
      link,
      "",
      `The link works once, and stops working in ${minutes} minutes.`,
      "",
      "If you did not ask for this, ignore this email. Your password has not changed.",
      "",
    ].join("\n");
  }
}

// The error's class and its codes, without its message. For a mail server
// that does not answer: "ServiceUnavailableException MAIL_UNAVAILABLE
// ETIMEDOUT". The last part is the code on the error's cause, or on the error
// itself when it has no cause.
function failureKind(error: unknown): string {
  if (!(error instanceof Error)) {
    return "an unknown error";
  }
  const { errorCode } = error as Error & { errorCode?: unknown };
  const { code } = (error.cause instanceof Error ? error.cause : error) as Error & {
    code?: unknown;
  };
  return [error.name, errorCode, code].filter((part) => typeof part === "string").join(" ");
}
