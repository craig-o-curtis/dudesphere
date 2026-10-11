import nodemailer from "nodemailer";

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

  it("rejects when the mail server refuses the message", async () => {
    const refused = new Error("550 mailbox unavailable");
    sendMail.mockRejectedValue(refused);
    const provider = new SmtpMailProvider(mailpit);

    await expect(provider.send({ to: "w@x.com", subject: "Hello", text: "Hi" })).rejects.toBe(
      refused,
    );
  });
});
