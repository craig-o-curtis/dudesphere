import type { ColumnOptions } from "typeorm";
import { Column } from "typeorm";

import { isoTimestampTransformer } from "../utils/iso-timestamp-transformer.js";

/**
 * Generic UTC timestamp column with custom options.
 * Use this for nullable or otherwise non-standard timestamp columns.
 *
 * The column type is `timestamptz` (timestamp with time zone), and that is
 * what makes the value mean the same instant on every machine.
 *
 * A plain `timestamp` holds a bare wall time, such as 11:21:09, with no zone.
 * The pg driver has to guess the zone when it reads one, and it guesses the
 * zone of the machine the app runs on. The database clock writes UTC, so on
 * a machine three hours ahead of UTC every createdAt came back three hours
 * early. In the other direction, a value the app wrote was stored as that
 * machine's local time. A `timestamptz` column stores the instant itself, so
 * there is nothing to guess in either direction.
 */
export function UtcColumn(options?: { nullable?: boolean }): PropertyDecorator {
  const columnOptions: ColumnOptions = {
    type: "timestamptz",
    ...(options?.nullable ? { nullable: true } : {}),
    transformer: isoTimestampTransformer,
  };

  return Column(columnOptions);
}
