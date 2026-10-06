export class HashtagResponseDto {
  constructor(partial: Partial<HashtagResponseDto>) {
    Object.assign(this, partial);
  }

  // The normalized lookup key. This is the value to send back as
  // GET /abidings?hashtag=<slug>.
  slug: string;

  // The casing the tag was first written with, for display.
  display: string;

  firstUsedAt: string;
}
