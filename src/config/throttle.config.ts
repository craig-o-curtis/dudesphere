import { registerAs } from "@nestjs/config";

import { validateEnv } from "./env.validate.js";

export default registerAs("throttle", () => {
  const env = validateEnv(process.env);
  return {
    // Env values are strings, and env.validate.ts allows only these two.
    enabled: env.THROTTLE_ENABLED === "true",
  };
});
