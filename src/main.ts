import { ClassSerializerInterceptor, ValidationPipe } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { NestFactory } from "@nestjs/core";

import { AppModule, ObserveInstrument } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

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

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
