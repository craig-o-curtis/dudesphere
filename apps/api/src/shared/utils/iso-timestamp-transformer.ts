/**
 * TypeORM transformer that ensures all timestamp columns return ISO 8601 UTC strings.
 * Intercepts Date objects from PostgreSQL to prevent timezone leakage into app code.
 */
export const isoTimestampTransformer = {
  to: normalizeDateToISO,
  from: normalizeDateToISO,
};

export function normalizeDateToISO(value: any): any {
  // oxlint-disable-next-line @northguild/gmt-oxlint/no-new-date — TypeORM transformer requires Date conversion
  if (value instanceof Date) return value.toISOString();
  return value;
}

/**
 * The other direction, for the one place that must hand a Date out:
 * TypeOrmAuthenticationStore, whose records @nestjs/authentication defines
 * with Date fields. Takes an ISO string read from a UtcColumn.
 */
export function isoToDate(iso: string): Date {
  // oxlint-disable-next-line @northguild/gmt-oxlint/no-new-date — the package's store contract requires a Date
  return new Date(iso);
}
