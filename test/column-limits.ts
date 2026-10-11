import { getMetadataArgsStorage } from "typeorm";

type Class = abstract new (...args: never[]) => object;

// A length rule as an entity's @Check writes it: char_length("username") <= 24
const LENGTH_CHECK = /^char_length\("(\w+)"\) <= (\d+)$/;

/**
 * The most characters each sized column of an entity can hold, by property
 * name. Read from the entity, so a spec never keeps its own copy of a limit.
 *
 * A limit is declared in one of two ways. A varchar column carries it as its
 * length. A citext column has no length, so its entity declares a
 * char_length @Check in its place, as User does for username and email.
 */
export function columnLimits(entity: Class): Map<string, number> {
  const storage = getMetadataArgsStorage();
  const limits = new Map<string, number>();

  for (const column of storage.columns) {
    if (column.target === entity && column.options.length !== undefined) {
      limits.set(column.propertyName, Number(column.options.length));
    }
  }

  for (const check of storage.checks) {
    const match = check.target === entity ? LENGTH_CHECK.exec(check.expression) : null;
    if (match) {
      limits.set(match[1], Number(match[2]));
    }
  }

  return limits;
}
