import type { ConfigType } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { configureApp } from "./app-setup.js";
import { AppModule, ObserveInstrument } from "./app.module.js";
import appConfig from "./config/app.config.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  // Shared with the e2e suite, so the tests exercise the same app this does.
  // See src/app-setup.ts.
  configureApp(app);

  const { port } = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);
  await app.listen(port);
}
await bootstrap();
