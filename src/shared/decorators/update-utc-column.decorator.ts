import type { ColumnOptions } from "typeorm";
import { Column } from "typeorm";

import { isoTimestampTransformer } from "../utils/iso-timestamp-transformer.js";

/**
 * Auto-set on creation, auto-update on every change. Always returns ISO 8601 UTC string.
 */
export function UpdateUtcColumn(): PropertyDecorator {
  const columnOptions: ColumnOptions = {
    type: "timestamp",
    default: () => "CURRENT_TIMESTAMP",
    onUpdate: "CURRENT_TIMESTAMP",
    transformer: isoTimestampTransformer,
  };

  return Column(columnOptions);
}
