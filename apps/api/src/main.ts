import type { ConfigType } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { configureApp } from "./app-setup.js";
import { AppModule, ObserveInstrument } from "./app.module.js";
import appConfig from "./config/app.config.js";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    instrument: ObserveInstrument,
  });

  // Behind a reverse proxy every request seems to come from the proxy, so
  // the rate limiter would give all callers one shared count. This trusts
  // X-Forwarded-For from a proxy on this machine only, as the docs show.
  // A host whose proxy is elsewhere needs its address here instead.
  // https://docs.nestjs.com/security/rate-limiting#proxies
  app.set("trust proxy", "loopback");

  // Shared with the e2e suite, so the tests exercise the same app this does.
  // See src/app-setup.ts.
  configureApp(app);

  // Closes the Postgres pool and the Mongo connection on SIGTERM and SIGINT,
  // so a stop or a redeploy does not cut a connection mid-write.
  // https://docs.nestjs.com/fundamentals/lifecycle-events#application-shutdown
  // SIGTERM means "terminate": the polite request to stop. `kill <pid>`,
  // `docker stop` and most hosts on a redeploy send it, then wait a few
  // seconds before they kill the process outright.
  // SIGINT means "interrupt": what the terminal sends when you press Ctrl+C,
  // so this is the one you hit in local dev.
  app.enableShutdownHooks();

  const { port } = app.get<ConfigType<typeof appConfig>>(appConfig.KEY);
  await app.listen(port);
}
await bootstrap();
