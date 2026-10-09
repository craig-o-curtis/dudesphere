import { ClassSerializerInterceptor, INestApplication, ValidationPipe } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { AllExceptionsFilter } from "./shared/filters/all-exceptions.filter.js";
import { MongoErrorFilter } from "./shared/filters/mongo-error.filter.js";
import { QueryFailedFilter } from "./shared/filters/query-failed.filter.js";
import {
  REQUEST_TIMEOUT_MS,
  TimeoutInterceptor,
} from "./shared/interceptors/timeout.interceptor.js";
import { requestId } from "./shared/middleware/request-id.middleware.js";

/**
 * Everything the running app has beyond its modules: the request id, the
 * request time limit, the serializer, the validation rules and the error
 * filters.
 *
 * This lives apart from bootstrap() so the e2e suite can apply it too.
 * Test.createTestingModule(...).createNestApplication() does not run main.ts,
 * so before this existed those tests ran against an app with no ValidationPipe,
 * no ClassSerializerInterceptor and no QueryFailedFilter — a different app from
 * the one in production, which is the opposite of what an end-to-end test is
 * for. A request body with an unknown field was accepted there and rejected in
 * production.
 */
export function configureApp(
  app: INestApplication,
  // A test passes a short limit, so it can prove the 408 without waiting
  // ten seconds. main.ts passes nothing.
  { requestTimeoutMs = REQUEST_TIMEOUT_MS }: { requestTimeoutMs?: number } = {},
): void {
  // First, so guards, pipes, and filters all see the id.
  app.use(requestId);

  app.useGlobalInterceptors(
    // Listed first, so it wraps the serializer and the handler: the limit
    // covers everything from the pipes to the response body.
    new TimeoutInterceptor(requestTimeoutMs),
    // Enable serialization to exclude sensitive fields (e.g. password)
    // So using @Exclude() will work
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  // Enable validation with class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // ignores any extra properties that are not defined in the DTO
      forbidNonWhitelisted: true, // throws an error if any extra properties are present
      transform: true, // automatically transforms payloads to be objects typed according to their DTO classes
    }),
  );

  // Order matters. Nest tries global filters last to first, so the catch-all
  // goes first and the specific ones after it. See "Catch everything" on
  // https://docs.nestjs.com/exception-filters
  const adapter = app.getHttpAdapter();
  app.useGlobalFilters(
    new AllExceptionsFilter(adapter),
    new QueryFailedFilter(adapter),
    new MongoErrorFilter(adapter),
  );
}
