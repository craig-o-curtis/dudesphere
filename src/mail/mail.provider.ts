/** One email. `from` is not here: every message goes out from MAIL_FROM. */
export interface MailMessage {
  to: string;
  subject: string;
  /** The plain-text body. Every message has one. */
  text: string;
  /** An HTML body, shown in its place by a mail app that can. Escape anything a user typed. */
  html?: string;
}

/**
 * Sends an email.
 *
 * It is an abstract class, not an interface, so it can be the injection
 * token: a service asks for MailProvider and never names how the mail is
 * sent. MailModule decides which class stands behind it. This is the same
 * shape as HashingProvider in src/hashing.
 *
 * A test puts a fake behind it and reads what would have been sent, so no
 * test needs a mail server.
 */
export abstract class MailProvider {
  /**
   * Resolves when the mail server has accepted the message. Rejects with a
   * 503 MAIL_UNAVAILABLE if it could not be sent. The mail client's own error
   * is that exception's cause, and never the rejection itself.
   */
  abstract send(message: MailMessage): Promise<void>;
}
