import type { ColumnOptions } from "typeorm";
import { DeleteDateColumn } from "typeorm";

import { isoTimestampTransformer } from "../utils/iso-timestamp-transformer.js";

/**
 * Soft delete column — wraps TypeORM's @DeleteDateColumn with our transformer.
 * Enables repository.softDelete() and automatic exclusion from queries.
 */
export function SoftDeleteUtcColumn(): PropertyDecorator {
  const options: ColumnOptions = { transformer: isoTimestampTransformer };

  return DeleteDateColumn(options);
}
