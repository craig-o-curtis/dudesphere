// A display name is unique, so that one member cannot pass as another. That
// only works when two names that look the same are the same string. These two
// exports close the gaps that are cheap to close:
//
// - cleanDisplayName makes spacing and the Unicode form the same for
//   everyone, so "The  Dude " and "The Dude" are one name.
// - DISPLAY_NAME_CHARACTERS refuses characters nobody can see, so "The Dude"
//   with a hidden character in it is not a second name.
//
// What they do not stop: a letter from another alphabet that looks like a
// Latin one, accents and other marks stacked on a letter, and variation
// selectors, which emoji need. Postgres compares what is stored, ignoring
// only letter case.

/**
 * A display name as it is checked and stored: in Unicode form NFKC, with each
 * run of whitespace made one space, and no space at either end.
 *
 * NFKC folds the forms that mean the same letter into one, such as a
 * full-width "Ｄ" into "D". It also turns the other kinds of space into a
 * plain one.
 *
 * A value that is not a string is returned as it is, so the validators still
 * see it and refuse it. Used in a DTO's @Transform.
 */
export function cleanDisplayName(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

/**
 * Matches a string with no character that cannot be seen. For @Matches.
 *
 * Refused, by Unicode category: control characters (Cc), formatting
 * characters such as the zero-width space and the joiners (Cf), private-use
 * characters (Co) and unpaired surrogates (Cs). Refused by name: the
 * combining grapheme joiner, and the letters and symbol that are drawn as a
 * blank, which are the Hangul fillers and the empty braille cell.
 *
 * Cost: an emoji built by joining others with a zero-width joiner, such as a
 * family, is refused. A single emoji is fine.
 */
export const DISPLAY_NAME_CHARACTERS = /^[^͏\p{Cc}\p{Cf}\p{Co}\p{Cs}ᅟᅠㅤﾠ⠀]*$/u;
