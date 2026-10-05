import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { getUtcNow } from "@northguild/gmt";
import { Model } from "mongoose";

import { Abiding, AbidingDocument } from "./abiding.schema.js";

// Soft-deletes and restores all of one user's abidings. UsersService calls
// these from inside its Postgres transaction, as the last step, so a Mongo
// failure throws and rolls the user change back.
//
// Mongo is not part of that transaction. If Postgres fails to commit after
// these run, the abidings change and the user does not. Retrying the same
// request fixes it, because both methods only touch rows still in the old state.
@Injectable()
export class UserAbidingsService {
  private readonly logger = new Logger(UserAbidingsService.name);

  constructor(@InjectModel(Abiding.name) private readonly abidingModel: Model<AbidingDocument>) {}

  async softDeleteForUser(userId: number): Promise<void> {
    // getUtcNow returns "" on failure. Throwing rolls back the user delete
    // instead of hiding the abidings with a blank timestamp.
    const deletedAt = getUtcNow();
    if (!deletedAt) {
      throw new ServiceUnavailableException("Could not read the current UTC time");
    }
    try {
      // deletedAt: null so abidings already deleted keep their first timestamp.
      await this.abidingModel
        .updateMany({ userId, deletedAt: null }, { $set: { deletedAt } })
        .exec();
    } catch (error) {
      this.logger.error(
        `Could not soft-delete abidings for user #${userId}`,
        error instanceof Error ? error.stack : error,
      );
      throw new ServiceUnavailableException("Could not update abidings");
    }
  }

  // Brings back every soft-deleted abiding of the user. That is safe because
  // deleting a single abiding is a hard delete, so the only soft-deleted
  // abidings are the ones softDeleteForUser hid.
  async restoreForUser(userId: number): Promise<void> {
    // No clock read here, unlike softDeleteForUser: restoring writes null.
    try {
      // $ne: null so only abidings softDeleteForUser hid are touched.
      await this.abidingModel
        .updateMany({ userId, deletedAt: { $ne: null } }, { $set: { deletedAt: null } })
        .exec();
    } catch (error) {
      this.logger.error(
        `Could not restore abidings for user #${userId}`,
        error instanceof Error ? error.stack : error,
      );
      throw new ServiceUnavailableException("Could not update abidings");
    }
  }
}
