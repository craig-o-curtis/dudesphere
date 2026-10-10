/**
 * The values in a comma-separated string, such as the `?hashtag=dude,sunday`
 * filter on GET /abidings. Each part is trimmed and the empty ones are
 * dropped, so `"a,, b ,"` holds two values.
 *
 * `@MaxCommaSeparated` counts with this function, so the limit it enforces is
 * on the same list the handler reads.
 */
export function splitCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}
