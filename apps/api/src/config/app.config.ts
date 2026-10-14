import { registerAs } from "@nestjs/config";

import { validateEnv } from "./env.validate.js";

export default registerAs("app", () => {
  const env = validateEnv(process.env);
  return {
    environment: env.NODE_ENV,
    port: env.PORT,
  };
});
