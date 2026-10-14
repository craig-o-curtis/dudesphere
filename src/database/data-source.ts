import "dotenv/config";
import { fileURLToPath } from "node:url";

import { DataSource } from "typeorm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default new DataSource({
  type: "postgres",
  host: process.env.PG_HOST || "localhost",
  port: parseInt(process.env.PG_PORT ?? "5432", 10),
  username: process.env.PG_ADMIN_USER || "postgres",
  password: process.env.PG_ADMIN_PW || "postgres",
  database: process.env.PG_DATABASE || "dudesphere",
  // *.entities matches src/typeorm/authentication.entities.ts, which keeps
  // the auth package's tables in one file, as the NestJS docs do.
  entities: [__dirname + "../**/*.entity{.ts,.js}", __dirname + "../**/*.entities{.ts,.js}"],
  migrations: [__dirname + "migrations/*{.ts,.js}"],
  logging: false,
});
