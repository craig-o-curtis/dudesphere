import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import nodemailer, { type Transporter } from "nodemailer";

import { ErrorCode } from "../shared/error-codes.js";
import mailConfig from "./config/mail.config.js";
import { MailProvider, type MailMessage } from "./mail.provider.js";

// The port a mail server expects TLS on from the first byte. On any other
// port Nodemailer starts in plain text and upgrades with STARTTLS when the
// server offers it.
const IMPLICIT_TLS_PORT = 465;

// How long to wait for the mail server before giving up, in milliseconds.
// Nodemailer's own defaults are minutes long.
const SMTP_TIMEOUT_MS = 10_000;

/**
 * Sends mail through any SMTP server, with Nodemailer. Which server is set by
 * the MAIL_ variables. In development that is the Mailpit container from
 * docker-compose.yml, which keeps every message and delivers none.
 */
@Injectable()
export class SmtpMailProvider implements MailProvider {
  private readonly transporter: Transporter;

  constructor(@Inject(mailConfig.KEY) private readonly mail: ConfigType<typeof mailConfig>) {
    // Nothing connects here. Nodemailer opens a connection when send() runs.
    this.transporter = nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.port === IMPLICIT_TLS_PORT,
      // With a login set, the server must take STARTTLS, or nothing is sent.
      // Without this, a server or a box in between that does not offer it
      // would get the login and the email in plain text. Mailpit has no
      // login and no TLS, so local mail is not affected.
      requireTLS: Boolean(mail.user),
      // Mailpit takes mail with no login, so both variables are optional.
      ...(mail.user ? { auth: { user: mail.user, pass: mail.password ?? "" } } : {}),
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    });
  }

  // Nodemailer's own error never leaves this class. When the mail server
  // does not answer, that error carries a socket code such as ETIMEDOUT, and
  // AllExceptionsFilter reads a bare error with such a code as a database
  // outage. So every failure is wrapped in a 503 of mail's own, with the
  // original as its cause for the log.
  async send(message: MailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.mail.from, ...message });
    } catch (error) {
      throw new ServiceUnavailableException("Mail could not be sent", {
        cause: error,
        errorCode: ErrorCode.MAIL_UNAVAILABLE,
      });
    }
  }
}
