import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { Abiding, AbidingSchema } from "./abiding.schema.js";
import { UserAbidingsService } from "./user-abidings.service.js";

// Split out of AbidingModule so UsersModule can reach the Abiding model
// without creating a circular dependency.
//
// AbidingModule imports UsersModule, to look up usernames for the
// GET /abidings response. UsersModule now also needs the Abiding model, to
// soft-delete and restore a user's abidings in UsersService.deleteUser and
// restoreUser. If UsersModule imported AbidingModule directly, that would be
// AbidingModule -> UsersModule -> AbidingModule: a cycle.
//
// This module holds only the Abiding model registration and
// UserAbidingsService, nothing that depends on users. AbidingModule and
// UsersModule both import it, and neither imports the other's module.
@Module({
  imports: [MongooseModule.forFeature([{ name: Abiding.name, schema: AbidingSchema }])],
  providers: [UserAbidingsService],
  exports: [MongooseModule, UserAbidingsService],
})
export class AbidingModelModule {}
