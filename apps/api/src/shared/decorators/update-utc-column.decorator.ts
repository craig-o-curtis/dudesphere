import type { ColumnOptions } from "typeorm";
import { UpdateDateColumn } from "typeorm";

import { isoTimestampTransformer } from "../utils/iso-timestamp-transformer.js";

/**
 * Auto-set on creation, auto-update on every change. Always returns ISO 8601 UTC string.
 *
 * It wraps TypeORM's @UpdateDateColumn, which is what makes the "every
 * change" part true. TypeORM's update() and save() stamp only the column
 * marked this way. A plain @Column with `onUpdate: "CURRENT_TIMESTAMP"` does
 * nothing on Postgres: that option is MySQL's, and with it this column never
 * changed after the row was created.
 *
 * `timestamptz`, not `timestamp`. See utc-column.decorator.ts for why.
 */
export function UpdateUtcColumn(): PropertyDecorator {
  const columnOptions: ColumnOptions = {
    type: "timestamptz",
    transformer: isoTimestampTransformer,
  };

  return UpdateDateColumn(columnOptions);
}
