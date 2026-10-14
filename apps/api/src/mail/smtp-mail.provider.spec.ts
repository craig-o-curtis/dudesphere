import { ServiceUnavailableException } from "@nestjs/common";
import nodemailer from "nodemailer";

import { isDatabaseUnreachable } from "../shared/filters/database-unreachable.js";
import { SmtpMailProvider } from "./smtp-mail.provider.js";

// No test opens a connection. createTransport is replaced, and the spec
// reads what the provider asked it for.
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn() },
}));

const createTransport = vi.mocked(nodemailer.createTransport);

describe("SmtpMailProvider", () => {
  const sendMail = vi.fn();

  const mailpit = {
    host: "localhost",
    port: 1025,
    user: undefined,
    password: undefined,
    from: "Dudesphere <no-reply@dudesphere.local>",
  };

  /** The options the provider passed to createTransport. */
  function transportOptions(): Record<string, unknown> {
    return createTransport.mock.calls[0][0] as unknown as Record<string, unknown>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    sendMail.mockResolvedValue({ messageId: "1" });
    createTransport.mockReturnValue({ sendMail } as unknown as ReturnType<
      typeof nodemailer.createTransport
    >);
  });

  it("connects to the host and port from the config", () => {
    new SmtpMailProvider(mailpit);

    expect(transportOptions()).toMatchObject({ host: "localhost", port: 1025, secure: false });
  });

  // Mailpit takes mail with no login. An auth block with empty values would
  // make Nodemailer try to log in and fail.
  it("sends no login when no user is set", () => {
    new SmtpMailProvider(mailpit);

    expect(transportOptions()).not.toHaveProperty("auth");
  });

  it("logs in when a user is set", () => {
    new SmtpMailProvider({ ...mailpit, user: "apikey", password: "s3cret" });

    expect(transportOptions()).toMatchObject({ auth: { user: "apikey", pass: "s3cret" } });
  });

  it("uses TLS from the start on port 465, and on no other port", () => {
    new SmtpMailProvider({ ...mailpit, port: 465 });
    new SmtpMailProvider({ ...mailpit, port: 587 });

    expect(createTransport.mock.calls[0][0]).toMatchObject({ secure: true });
    expect(createTransport.mock.calls[1][0]).toMatchObject({ secure: false });
  });

  // A real mail server has a login. With one, the login and the email must
  // not go out in plain text because the server did not offer STARTTLS.
  it("requires TLS when a user is set, and not for Mailpit", () => {
    new SmtpMailProvider({ ...mailpit, port: 587, user: "apikey", password: "s3cret" });
    new SmtpMailProvider(mailpit);

    expect(createTransport.mock.calls[0][0]).toMatchObject({ requireTLS: true });
    expect(createTransport.mock.calls[1][0]).toMatchObject({ requireTLS: false });
  });

  // Nodemailer's own limits are minutes long.
  it("gives up on a mail server that does not answer within ten seconds", () => {
    new SmtpMailProvider(mailpit);

    expect(transportOptions()).toMatchObject({
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });
  });

  it("sends the message from the configured address", async () => {
    const provider = new SmtpMailProvider(mailpit);

    await provider.send({ to: "w@x.com", subject: "Hello", text: "Hi walter" });

    expect(sendMail).toHaveBeenCalledWith({
      from: "Dudesphere <no-reply@dudesphere.local>",
      to: "w@x.com",
      subject: "Hello",
      text: "Hi walter",
    });
  });

  it("rejects with a 503 MAIL_UNAVAILABLE when the mail server refuses the message", async () => {
    const refused = new Error("550 mailbox unavailable");
    sendMail.mockRejectedValue(refused);
    const provider = new SmtpMailProvider(mailpit);

    const thrown: unknown = await provider
      .send({ to: "w@x.com", subject: "Hello", text: "Hi" })
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(ServiceUnavailableException);
    const exception = thrown as ServiceUnavailableException;
    expect(exception.message).toBe("Mail could not be sent");
    expect(exception.errorCode).toBe("MAIL_UNAVAILABLE");
    // The mail client's error is kept for the log, and only there.
    expect(exception.cause).toBe(refused);
  });

  // Nodemailer puts ETIMEDOUT on its error when the server does not answer.
  // AllExceptionsFilter answers a bare error with that code as 503
  // DATABASE_UNAVAILABLE, so it must not get out of the provider as it is.
  it("does not let a mail server timeout pass for a database outage", async () => {
    const timedOut = Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" });
    sendMail.mockRejectedValue(timedOut);
    const provider = new SmtpMailProvider(mailpit);

    const thrown: unknown = await provider
      .send({ to: "w@x.com", subject: "Hello", text: "Hi" })
      .catch((error: unknown) => error);

    expect(isDatabaseUnreachable(timedOut)).toBe(true);
    expect(isDatabaseUnreachable(thrown)).toBe(false);
  });
});
