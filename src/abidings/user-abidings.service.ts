import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { getUtcNow } from "@northguild/gmt";
import { Model } from "mongoose";

import { ErrorCode } from "../shared/error-codes.js";
import { Abiding, AbidingDocument } from "./abiding.schema.js";

// Soft-deletes and restores all of one user's abidings. UsersService calls
// these from inside its Postgres transaction, as the last step, so a Mongo
// failure throws and rolls the user change back.
//
// Neither method catches that failure. It has to escape for the rollback, and
// MongoErrorFilter already answers a Mongo outage with a 503 on every route.
// A catch here would also turn a plain bug into "database unavailable".
//
// Mongo is not part of that transaction. If Postgres fails to commit after
// these run, the abidings change and the user does not. Retrying the same
// request fixes it, because both methods only touch rows still in the old state.
@Injectable()
export class UserAbidingsService {
  constructor(@InjectModel(Abiding.name) private readonly abidingModel: Model<AbidingDocument>) {}

  async softDeleteForUser(userId: number): Promise<void> {
    // getUtcNow returns "" on failure. Throwing rolls back the user delete
    // instead of hiding the abidings with a blank timestamp.
    const deletedAt = getUtcNow();
    if (!deletedAt) {
      throw new ServiceUnavailableException("Could not read the current UTC time", {
        errorCode: ErrorCode.CLOCK_UNAVAILABLE,
      });
    }
    // deletedAt: null so abidings already deleted keep their first timestamp.
    await this.abidingModel.updateMany({ userId, deletedAt: null }, { $set: { deletedAt } }).exec();
  }

  // Brings back every soft-deleted abiding of the user. That is safe because
  // deleting a single abiding is a hard delete, so the only soft-deleted
  // abidings are the ones softDeleteForUser hid.
  async restoreForUser(userId: number): Promise<void> {
    // No clock read here, unlike softDeleteForUser: restoring writes null.
    // $ne: null so only abidings softDeleteForUser hid are touched.
    await this.abidingModel
      .updateMany({ userId, deletedAt: { $ne: null } }, { $set: { deletedAt: null } })
      .exec();
  }
}
