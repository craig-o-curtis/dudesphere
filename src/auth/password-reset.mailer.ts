import {
  AuthenticationRegistry,
  PasswordResetHandler,
  type PasswordResetLink,
} from "@nestjs/authentication";
import { Inject, Injectable } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { DataSource } from "typeorm";

import { MailProvider } from "../mail/mail.provider.js";
import { utcNowOrThrow } from "../shared/utils/utc-clock.js";
import { SignInsRepository } from "../typeorm/sign-ins.repository.js";
import { UsersRepository } from "../users/users.repository.js";
import authConfig from "./config/auth.config.js";

/**
 * The app's half of password reset: the docs' PasswordResetMailer, from
 * "Reset forgotten passwords" on https://docs.nestjs.com/security/authentication.
 *
 * The package owns the links. It makes the token, stores its hash, checks it
 * when it comes back, and ends every sign-in of the member after a reset.
 * This class finds the account, sends the email, and stores the new hash.
 *
 * The docs send through @nestjs/mail. This app already has MailProvider, so
 * the email goes through that.
 */
@Injectable()
export class PasswordResetMailer extends PasswordResetHandler {
  constructor(
    // @Inject names each token outright, because `pnpm seed:run` builds the
    // whole app through tsx, which emits no constructor types.
    @Inject(UsersRepository) private readonly usersRepository: UsersRepository,
    @Inject(MailProvider) private readonly mailProvider: MailProvider,
    @Inject(authConfig.KEY) private readonly auth: ConfigType<typeof authConfig>,
    @Inject(DataSource) private readonly dataSource: DataSource,
    @Inject(SignInsRepository) private readonly signIns: SignInsRepository,
    @Inject(AuthenticationRegistry) registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerHandler("passwordReset", this);
  }

  // The link goes to the address the account has stored, and works only while
  // the account keeps that address and this hash: any change invalidates it.
  async findUser(email: string) {
    const found = await this.usersRepository.findCredentials(email);
    return (
      found && {
        id: String(found.user.id),
        email: found.user.email,
        passwordHash: found.passwordHash,
      }
    );
  }

  async send(link: PasswordResetLink): Promise<void> {
    const user = await this.usersRepository.findById(Number(link.userId));
    if (!user) {
      return;
    }
    await this.mailProvider.send({
      to: link.email,
      subject: "Reset your Dudesphere password",
      text: this.emailText(user.username, link.url),
    });
  }

  // Stores the hash, stamps passwordChangedAt, and ends every sign-in of the
  // member, in one transaction, so a reset never leaves the old sign-ins
  // going. The package ends the sign-ins again around this call, which finds
  // nothing left to end.
  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    const id = Number(userId);
    await this.dataSource.transaction(async (manager) => {
      await this.usersRepository.updatePasswordHash(id, passwordHash, utcNowOrThrow(), manager);
      await this.signIns.endAllForUser(id, manager);
    });
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
