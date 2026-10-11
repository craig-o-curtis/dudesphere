import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";

import { Abiding, AbidingSchema } from "./abiding.schema.js";
import { UserAbidingsService } from "./user-abidings.service.js";

// Holds only the Abiding model registration and UserAbidingsService, nothing
// that depends on users or profiles. AbidingsModule and UsersModule both
// import it. UsersModule needs it to soft-delete and restore a user's
// abidings in UsersService.deleteUser and restoreUser.
//
// It was split out of AbidingsModule when AbidingsModule imported UsersModule,
// to read the authors' usernames. UsersModule importing AbidingsModule back
// would have been a cycle. AbidingsModule now reads display names from
// ProfilesModule and no longer imports UsersModule, so that cycle is gone.
// The split stays: UsersModule needs these two things and none of the abiding
// routes.
@Module({
  imports: [MongooseModule.forFeature([{ name: Abiding.name, schema: AbidingSchema }])],
  providers: [UserAbidingsService],
  exports: [MongooseModule, UserAbidingsService],
})
export class UserAbidingsModule {}
