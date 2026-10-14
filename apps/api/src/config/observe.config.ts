import { registerAs } from "@nestjs/config";

import { validateEnv } from "./env.validate.js";

export default registerAs("observe", () => {
  const env = validateEnv(process.env);
  return {
    appKey: env.DUDE_OBSERVE_APP_KEY,
    appSecret: env.DUDE_OBSERVE_APP_SECRET,
  };
});
