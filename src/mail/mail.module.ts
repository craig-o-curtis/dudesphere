import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import mailConfig from "./config/mail.config.js";
import { MailProvider } from "./mail.provider.js";
import { SmtpMailProvider } from "./smtp-mail.provider.js";

// A module of its own, like HashingModule. Any feature that sends mail
// imports this one and asks for MailProvider.
@Module({
  // Mail owns its own config, as AuthModule does.
  imports: [ConfigModule.forFeature(mailConfig)],
  providers: [{ provide: MailProvider, useClass: SmtpMailProvider }],
  exports: [MailProvider],
})
export class MailModule {}
