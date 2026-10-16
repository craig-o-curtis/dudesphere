// A small client for Mailpit's HTTP API, for the browser tests that read the
// reset email. Mailpit is the mail catcher that `pnpm db:up` starts. Nest sends
// to its SMTP port, and this reads from its web port.
//
// Endpoints used (Mailpit v1 API, under /api/v1):
//
// - GET    /info                       is Mailpit up?
// - GET    /search?query=to:<address>  find messages sent to one address
// - GET    /message/{ID}               read one message (its Text body)
// - DELETE /messages  {"IDs": [...]}   delete messages by ID
//
// Only messages to `e2e-<12 hex>@example.com` addresses are ever deleted.

import { expect } from "@playwright/test";

export const MAILPIT_URL = (process.env.MAILPIT_URL ?? "http://localhost:8025").replace(/\/$/, "");

const E2E_ADDRESS = /^e2e-[0-9a-f]{12}@example\.com$/;
const LINK = /https?:\/\/\S+\/reset-password\?token=[A-Za-z0-9_-]+/;

interface MessageSummary {
  ID: string;
  To: { Address: string }[];
}

interface MessageDetail {
  Text: string;
}

export async function mailpitIsUp(): Promise<boolean> {
  try {
    const response = await fetch(`${MAILPIT_URL}/api/v1/info`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Every message sent to the address. Empty until the email has arrived. */
export async function findMessages(address: string): Promise<MessageSummary[]> {
  const url = `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`;
  const response = await fetch(url);
  expect(response.status, "Mailpit search").toBe(200);
  const body = (await response.json()) as { messages: MessageSummary[] };
  return body.messages;
}

export async function readText(id: string): Promise<string> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`);
  expect(response.status, "Mailpit message").toBe(200);
  return ((await response.json()) as MessageDetail).Text;
}

/** Pulls the reset link out of a message body. */
export function pullLink(text: string): string {
  const match = LINK.exec(text);
  expect(match, "a reset link in the email").not.toBeNull();
  return (match as RegExpExecArray)[0];
}

/**
 * Waits for the email to the address, then returns its reset link. Polls
 * instead of sleeping, so it returns as soon as Nest has handed the email over.
 */
export async function waitForResetLink(address: string): Promise<string> {
  let id = "";
  await expect
    .poll(
      async () => {
        const messages = await findMessages(address);
        id = messages[0]?.ID ?? "";
        return id;
      },
      { message: `an email to ${address}`, timeout: 20_000 },
    )
    .not.toBe("");
  return pullLink(await readText(id));
}

/**
 * Deletes the messages sent to these addresses. An address that is not
 * `e2e-<12 hex>@example.com` is skipped, so a real message is never touched.
 */
export async function deleteMessagesTo(addresses: Iterable<string>): Promise<void> {
  const ids: string[] = [];
  for (const address of addresses) {
    if (!E2E_ADDRESS.test(address)) continue;
    for (const message of await findMessages(address)) ids.push(message.ID);
  }
  if (ids.length === 0) return;
  const response = await fetch(`${MAILPIT_URL}/api/v1/messages`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ IDs: ids }),
  });
  expect(response.status, "Mailpit delete").toBe(200);
}
