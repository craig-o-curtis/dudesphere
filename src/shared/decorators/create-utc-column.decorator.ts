import type { ColumnOptions } from "typeorm";
import { Column } from "typeorm";

import { isoTimestampTransformer } from "../utils/iso-timestamp-transformer.js";

/**
 * Auto-set once on row creation. Always returns ISO 8601 UTC string.
 *
 * `timestamptz`, not `timestamp`. See utc-column.decorator.ts for why.
 */
export function CreateUtcColumn(): PropertyDecorator {
  const columnOptions: ColumnOptions = {
    type: "timestamptz",
    default: () => "CURRENT_TIMESTAMP",
    transformer: isoTimestampTransformer,
  };

  return Column(columnOptions);
}
