import { registerAs } from "@nestjs/config";

import { validateEnv } from "./env.validate.js";

export default registerAs("postgres", () => {
  const env = validateEnv(process.env);
  return {
    host: env.PG_HOST,
    port: env.PG_PORT,
    username: env.PG_ADMIN_USER,
    password: env.PG_ADMIN_PW,
    database: env.PG_DATABASE,
  };
});
