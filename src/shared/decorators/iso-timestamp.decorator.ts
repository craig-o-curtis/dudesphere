import { Column } from "typeorm";

import { normalizeDateToISO } from "../utils/iso-timestamp-transformer.js";

/**
 * TypeORM column decorator for native PostgreSQL timestamps that always return ISO 8601 UTC strings.
 * Use this instead of `@Column({ type: "timestamp", transformer: ... })` to avoid repetition.
 */
export function IsoTimestamp(options?: {
  nullable?: boolean;
  /** Set once on creation — use `() => "CURRENT_TIMESTAMP"` for auto-timestamp */
  default?: () => string;
  /** Auto-update on every change — use `"CURRENT_TIMESTAMP"` for updatedAt columns */
  onUpdate?: string;
}) {
  const columnOptions: Record<string, unknown> = {
    type: "timestamp",
    ...(options?.nullable ? { nullable: true } : {}),
    ...(options?.default ? { default: options.default } : {}),
    ...(options?.onUpdate ? { onUpdate: options.onUpdate } : {}),
    transformer: normalizeDateToISO,
  };

  return Column(columnOptions);
}

// import { Column, DeleteDateColumn } from "typeorm";
// import type { ColumnOptions } from "typeorm/decorator/options/ColumnOptions.js";

// import { normalizeDateToISO } from "../utils/iso-timestamp-transformer.js";

// /** Shared column options — all UTC timestamp columns get the transformer */
// const base = { type: "timestamp" as const, transformer: normalizeDateToISO };

// /**
//  * Generic UTC timestamp column with custom options.
//  * Use this for nullable or otherwise non-standard timestamp columns.
//  */
// export function UtcColumn(options?: Partial<ColumnOptions>) {
//   return Column({ ...base, ...options });
// }

// /**
//  * Auto-set once on row creation. Always returns ISO 8601 UTC string.
//  */
// export function CreatedUtcColumn() {
//   return Column({ ...base, default: () => "CURRENT_TIMESTAMP" });
// }

// /**
//  * Auto-set on creation, auto-update on every change. Always returns ISO 8601 UTC string.
//  */
// export function UpdatedUtcColumn() {
//   return Column({
//     ...base,
//     default: () => "CURRENT_TIMESTAMP",
//     onUpdate: "CURRENT_TIMESTAMP",
//   });
// }

// /**
//  * Soft delete column — wraps TypeORM's @DeleteDateColumn with our transformer.
//  * Enables repository.softDelete() and automatic exclusion from queries.
//  */
// export function SoftDeleteUtcColumn() {
//   return DeleteDateColumn({ transformer: normalizeDateToISO });
// }
