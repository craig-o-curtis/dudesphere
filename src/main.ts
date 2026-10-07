import { NestFactory } from "@nestjs/core";

import { configureApp } from "./app-setup.js";
import { AppModule, ObserveInstrument } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  // Shared with the e2e suite, so the tests exercise the same app this does.
  // See src/app-setup.ts.
  configureApp(app);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
