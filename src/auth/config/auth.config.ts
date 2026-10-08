import { registerAs } from "@nestjs/config";

import { validateEnv } from "../../config/env.validate.js";

export default registerAs("auth", () => {
  const env = validateEnv(process.env);
  return {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    audience: env.JWT_AUDIENCE,
    issuer: env.JWT_ISSUER,
  };
});
