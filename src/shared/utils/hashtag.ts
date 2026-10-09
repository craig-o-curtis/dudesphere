// Pulls hashtags out of an abiding message and normalizes them.
// The message keeps its original casing for display; these slugs are the
// index. Callers must never build a slug by hand — `#Sunday` and `#sunday`
// are the same tag only because this function says so.
// Captures the full run of word characters after `#`, with no upper bound,
// so a tag over 64 characters is matched whole and then dropped below rather
// than silently truncated to its first 64 characters.
const HASHTAG_PATTERN = /#([\p{L}\p{N}_]+)/gu;
const MAX_TAG_LENGTH = 64;
// The most tags one abiding carries. GET /abidings also takes at most this
// many in its ?hashtag= filter: see ListAbidingsQueryDto.
export const MAX_TAGS = 10;

export function extractHashtags(message: string): string[] {
  const seen = new Set<string>();
  for (const match of message.matchAll(HASHTAG_PATTERN)) {
    if (seen.size >= MAX_TAGS) {
      break;
    }
    const tag = match[1];
    if (tag.length > MAX_TAG_LENGTH) {
      continue;
    }
    seen.add(tag.toLowerCase());
  }
  return [...seen];
}

// Same extraction as extractHashtags, but keeps the casing each tag was
// written with: a map of normalized slug to first-seen display form, so
// "#Sunday" can be shown as written while still being indexed as "sunday".
// First use of a slug wins, matching how the registry stores it.
export function extractHashtagDisplays(message: string): Map<string, string> {
  const displays = new Map<string, string>();
  for (const match of message.matchAll(HASHTAG_PATTERN)) {
    if (displays.size >= MAX_TAGS) {
      break;
    }
    const tag = match[1];
    if (tag.length > MAX_TAG_LENGTH) {
      continue;
    }
    const slug = tag.toLowerCase();
    if (!displays.has(slug)) {
      displays.set(slug, tag);
    }
  }
  return displays;
}

// Normalizes one tag for a read filter. Same rules as extraction.
// Returns null when nothing usable is left.
export function normalizeHashtag(raw: string): string | null {
  const stripped = raw.startsWith("#") ? raw.slice(1) : raw;
  if (stripped.length < 1 || stripped.length > 64) {
    return null;
  }
  if (!/^[\p{L}\p{N}_]+$/u.test(stripped)) {
    return null;
  }
  return stripped.toLowerCase();
}
