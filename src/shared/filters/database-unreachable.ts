// Socket errors Node raises when a server cannot be reached. pg passes them
// on untouched, so they arrive as a plain Error carrying one of these codes.
// The Mongo driver usually wraps them in its own classes, but not always: the
// first query on a socket the server has closed can surface a bare EPIPE.
const SOCKET_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENOTFOUND",
  "EPIPE",
]);

// SQLSTATE codes Postgres sends when it will not serve the connection:
// 57P01 admin_shutdown, 57P02 crash_shutdown, 57P03 cannot_connect_now and
// 53300 too_many_connections.
const REFUSING_STATES = new Set(["57P01", "57P02", "57P03", "53300"]);

// SQLSTATE class 08 is "connection exception".
const CONNECTION_CLASS = "08";

// pg's own wording for a socket that closed under a running query. That error
// carries no code, so the message is all there is to go on.
const TERMINATED = /^Connection terminated/;

/**
 * True when the error means a database could not be reached, as opposed to
 * the database answering that the query was wrong. Pass the raw driver error:
 * for a QueryFailedError that is its `driverError`.
 *
 * The Mongo driver's own outage classes are not tested here. MongoErrorFilter
 * catches those by class.
 */
export function isDatabaseUnreachable(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const { code } = error as Error & { code?: unknown };
  if (typeof code === "string") {
    return SOCKET_CODES.has(code) || REFUSING_STATES.has(code) || code.startsWith(CONNECTION_CLASS);
  }
  return TERMINATED.test(error.message);
}
