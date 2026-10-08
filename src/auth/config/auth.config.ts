import { registerAs } from "@nestjs/config";

import { validateEnv } from "../../config/env.validate.js";

export default registerAs("auth", () => {
  const env = validateEnv(process.env);
  return {
    secret: env.JWT_SECRET,
  };
});
