import { registerAs } from "@nestjs/config";

import { validateEnv } from "../../config/env.validate.js";

export default registerAs("mail", () => {
  const env = validateEnv(process.env);
  return {
    host: env.MAIL_HOST,
    port: env.MAIL_PORT,
    user: env.MAIL_USER,
    password: env.MAIL_PASSWORD,
    from: env.MAIL_FROM,
  };
});
