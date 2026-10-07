import { ClassSerializerInterceptor, INestApplication, ValidationPipe } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { QueryFailedFilter } from "./shared/filters/query-failed.filter.js";

/**
 * Everything the running app has beyond its modules: the serializer, the
 * validation rules and the error filters.
 *
 * This lives apart from bootstrap() so the e2e suite can apply it too.
 * Test.createTestingModule(...).createNestApplication() does not run main.ts,
 * so before this existed those tests ran against an app with no ValidationPipe,
 * no ClassSerializerInterceptor and no QueryFailedFilter — a different app from
 * the one in production, which is the opposite of what an end-to-end test is
 * for. A request body with an unknown field was accepted there and rejected in
 * production.
 */
export function configureApp(app: INestApplication): void {
  // Enable serialization to exclude sensitive fields (e.g. password)
  // So using @Exclude() will work
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Enable validation with class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // ignores any extra properties that are not defined in the DTO
      forbidNonWhitelisted: true, // throws an error if any extra properties are present
      transform: true, // automatically transforms payloads to be objects typed according to their DTO classes
    }),
  );

  // Turns a unique violation that slipped past the service layer into a 409.
  app.useGlobalFilters(new QueryFailedFilter(app.getHttpAdapter()));
}
