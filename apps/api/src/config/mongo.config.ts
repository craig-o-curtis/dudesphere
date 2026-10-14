import { registerAs } from "@nestjs/config";

import { validateEnv } from "./env.validate.js";

export default registerAs("mongo", () => {
  const env = validateEnv(process.env);
  return {
    uri: env.MONGO_URI,
  };
});
