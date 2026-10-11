import { Inject, Injectable } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import nodemailer, { type Transporter } from "nodemailer";

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
      // Mailpit takes mail with no login, so both variables are optional.
      ...(mail.user ? { auth: { user: mail.user, pass: mail.password ?? "" } } : {}),
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.mail.from, ...message });
  }
}
