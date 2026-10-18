import { registerAs } from "@nestjs/config";

import { validateEnv } from "./env.validate.js";

export default registerAs("throttle", () => {
  const env = validateEnv(process.env);
  return {
    // Env values are strings, and env.validate.ts allows only these two.
    enabled: env.THROTTLE_ENABLED === "true",
    // Unset, or empty in .env, means X-Client-Ip is never trusted. See
    // src/auth/auth-throttler.guard.ts.
    bffSecret: env.BFF_SECRET,
  };
});
