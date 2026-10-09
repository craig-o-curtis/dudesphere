import { BadRequestException } from "@nestjs/common";

/**
 * A database, not a DTO, was the first to refuse a value. A 400.
 *
 * It is the caller's mistake, so it is a 400. It is also ours: a DTO should
 * have refused the value before any query ran. The filter that throws this
 * logs a warning with the route, so the missing rule can be found.
 *
 * The message is fixed. The driver's own text can quote the refused value, so
 * it rides along as the cause and is never returned.
 */
export class InvalidValueException extends BadRequestException {
  constructor(cause: unknown) {
    super("A value in the request is not valid", { cause });
  }
}
