import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

export const REQUEST_ID_HEADER = "x-request-id";

// Only an id that looks like one is kept. Anything else from the caller is
// replaced, so a log line never carries a 10 KB header value.
// example: "1234567890abcdef" is kept,
// but "1234567890abcdefg" is replaced to "1234567890abcdef".
const SAFE_ID = /^[A-Za-z0-9._-]{1,64}$/;

// Gives every request an id and returns it in the response header. The
// catch-all filter logs it on every 5xx, so a caller who reports "it failed"
// can quote the header and you can find the log line.
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  req.headers[REQUEST_ID_HEADER] = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
