import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { Abiding, AbidingSchema } from "./abiding.schema.js";
import { UserAbidingsService } from "./user-abidings.service.js";

// Owns the Abiding model on its own, with no imports from users.
// AbidingModule imports UsersModule to look up authors, so UsersModule cannot
// import AbidingModule back without a circular dependency. Both import this.
@Module({
  imports: [MongooseModule.forFeature([{ name: Abiding.name, schema: AbidingSchema }])],
  providers: [UserAbidingsService],
  exports: [MongooseModule, UserAbidingsService],
})
export class AbidingModelModule {}
