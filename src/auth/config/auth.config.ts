import { registerAs } from "@nestjs/config";

import { validateEnv } from "../../config/env.validate.js";

export default registerAs("auth", () => {
  const env = validateEnv(process.env);
  return {
    secret: env.JWT_SECRET,
    // All three lifetimes are in seconds: the access token, one refresh
    // token, and every refresh token of one sign-in together.
    expiresIn: env.JWT_EXPIRES_IN,
    refreshExpiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
    refreshAbsoluteExpiresIn: env.REFRESH_TOKEN_ABSOLUTE_EXPIRES_IN,
    audience: env.JWT_AUDIENCE,
    issuer: env.JWT_ISSUER,
    // For the password reset email: where its link points, and how long the
    // link works, in seconds.
    frontendUrl: env.FRONTEND_URL,
    passwordResetExpiresIn: env.PASSWORD_RESET_EXPIRES_IN,
  };
});
