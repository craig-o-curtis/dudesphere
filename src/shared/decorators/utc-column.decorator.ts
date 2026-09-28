import type { ColumnOptions } from "typeorm";
import { Column } from "typeorm";

import { isoTimestampTransformer } from "../utils/iso-timestamp-transformer.js";

/**
 * Generic UTC timestamp column with custom options.
 * Use this for nullable or otherwise non-standard timestamp columns.
 */
export function UtcColumn(options?: { nullable?: boolean }): PropertyDecorator {
  const columnOptions: ColumnOptions = {
    type: "timestamp",
    ...(options?.nullable ? { nullable: true } : {}),
    transformer: isoTimestampTransformer,
  };

  return Column(columnOptions);
}
