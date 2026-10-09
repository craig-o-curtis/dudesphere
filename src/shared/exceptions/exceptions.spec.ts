import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  type HttpException,
  InternalServerErrorException,
  RequestTimeoutException,
  ServiceUnavailableException,
  type Type,
  UnauthorizedException,
} from "@nestjs/common";

import { DatabaseFaultException } from "./database-fault.exception.js";
import { DatabaseUnavailableException } from "./database-unavailable.exception.js";
import { InvalidValueException } from "./invalid-value.exception.js";
import { NotOwnerException } from "./not-owner.exception.js";
import { TimeLimitExceededException } from "./time-limit-exceeded.exception.js";
import { TokenMissingException } from "./token-missing.exception.js";
import { ValueTakenException } from "./value-taken.exception.js";

// One table for every exception class in this folder. Each row pins what a
// caller receives: the status, the whole body and the error code. A class
// here is a named failure with one fixed answer, so the answer is the thing
// worth testing.
//
// Each class also has to stay an instance of the built-in it extends. Nest
// and the exception filters treat it as that built-in, and so do the specs
// that assert on the parent class.
describe("the app's own exception classes", () => {
  const cause = new Error("the driver's error");

  interface Expected {
    parent: Type<HttpException>;
    status: number;
    body: object;
    errorCode?: string;
    cause?: unknown;
  }

  const cases: [name: string, build: () => HttpException, expected: Expected][] = [
    [
      "ValueTakenException for an email",
      () => new ValueTakenException("email"),
      {
        parent: ConflictException,
        status: 409,
        body: {
          statusCode: 409,
          message: "Email already registered",
          error: "Conflict",
          errorCode: "EMAIL_TAKEN",
        },
        errorCode: "EMAIL_TAKEN",
      },
    ],
    [
      "ValueTakenException for a username",
      () => new ValueTakenException("username"),
      {
        parent: ConflictException,
        status: 409,
        body: {
          statusCode: 409,
          message: "Username already taken",
          error: "Conflict",
          errorCode: "USERNAME_TAKEN",
        },
        errorCode: "USERNAME_TAKEN",
      },
    ],
    [
      "ValueTakenException with no field, from a database filter",
      () => new ValueTakenException(undefined, { cause }),
      {
        parent: ConflictException,
        status: 409,
        body: {
          statusCode: 409,
          message: "That value is already taken",
          error: "Conflict",
          errorCode: "VALUE_TAKEN",
        },
        errorCode: "VALUE_TAKEN",
        cause,
      },
    ],
    [
      "NotOwnerException",
      () => new NotOwnerException("Not authorized to edit this abiding"),
      {
        parent: ForbiddenException,
        status: 403,
        body: {
          statusCode: 403,
          message: "Not authorized to edit this abiding",
          error: "Forbidden",
          errorCode: "NOT_OWNER",
        },
        errorCode: "NOT_OWNER",
      },
    ],
    [
      "TokenMissingException",
      () => new TokenMissingException("Missing or invalid authorization header"),
      {
        parent: UnauthorizedException,
        status: 401,
        body: {
          statusCode: 401,
          message: "Missing or invalid authorization header",
          error: "Unauthorized",
          errorCode: "TOKEN_MISSING",
        },
        errorCode: "TOKEN_MISSING",
      },
    ],
    [
      "DatabaseUnavailableException",
      () => new DatabaseUnavailableException(cause),
      {
        parent: ServiceUnavailableException,
        status: 503,
        body: {
          statusCode: 503,
          message: "Database unavailable",
          error: "Service Unavailable",
          errorCode: "DATABASE_UNAVAILABLE",
        },
        errorCode: "DATABASE_UNAVAILABLE",
        cause,
      },
    ],
    [
      "InvalidValueException",
      () => new InvalidValueException(cause),
      {
        parent: BadRequestException,
        status: 400,
        body: {
          statusCode: 400,
          message: "A value in the request is not valid",
          error: "Bad Request",
        },
        cause,
      },
    ],
    [
      "TimeLimitExceededException",
      () => new TimeLimitExceededException(cause),
      {
        parent: RequestTimeoutException,
        status: 408,
        body: { statusCode: 408, message: "Request Timeout" },
        cause,
      },
    ],
    [
      // The body Nest's base filter writes for any unknown error.
      "DatabaseFaultException",
      () => new DatabaseFaultException(cause),
      {
        parent: InternalServerErrorException,
        status: 500,
        body: { statusCode: 500, message: "Internal server error" },
        cause,
      },
    ],
  ];

  describe.each(cases)("%s", (_name, build, expected) => {
    it("answers with its status and its whole body", () => {
      const exception = build();

      expect(exception.getStatus()).toBe(expected.status);
      expect(exception.getResponse()).toEqual(expected.body);
    });

    it("carries its error code, or none", () => {
      expect(build().errorCode).toBe(expected.errorCode);
    });

    it("is still an instance of the built-in it extends", () => {
      expect(build()).toBeInstanceOf(expected.parent);
    });

    it("keeps the cause it was given, and never puts it in the body", () => {
      const exception = build();

      expect(exception.cause).toBe(expected.cause);
      expect(JSON.stringify(exception.getResponse())).not.toContain("the driver's error");
    });
  });
});
