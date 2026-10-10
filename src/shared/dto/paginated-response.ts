/** Which page a caller asked for. PaginationQueryDto has this shape. */
export interface PageRequest {
  limit: number;
  page: number;
}

/** What a service returns for a list: one page of rows and the count of all of them. */
export interface Page<T> {
  items: T[];
  total: number;
}

/** The body of every list route. */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    itemsPerPage: number;
    totalItems: number;
    currentPage: number;
    totalPages: number;
  };
  links: {
    first: string;
    last: string;
    current: string;
    next: string | null;
    previous: string | null;
  };
}

/** How many rows come before the requested page: OFFSET in Postgres, skip in Mongo. */
export function toSkip({ limit, page }: PageRequest): number {
  return (page - 1) * limit;
}

/**
 * Builds the body of a list route from one page of rows.
 *
 * A plain function, called by the controller. The service runs its own query
 * and returns a Page; nothing here knows which database it came from.
 *
 * `data` is passed through untouched, so each item must already be an
 * instance of its response DTO. ClassSerializerInterceptor applies @Exclude
 * and @Transform by looking at each item's class, and a plain copy has none.
 *
 * `filters` are the route's other query params, such as `userId` and
 * `hashtag` on GET /abidings. Every link carries them, so following `next`
 * stays inside the same filtered list.
 *
 * Links are relative, not full URLs. A full URL would have to trust the Host
 * header, which the caller controls, and would be wrong behind a proxy.
 */
export function toPaginatedResponse<T>(
  result: Page<T>,
  { limit, page }: PageRequest,
  path: string,
  filters: Record<string, string | number | undefined> = {},
): PaginatedResponse<T> {
  const totalPages = Math.ceil(result.total / limit);
  // An empty list has no pages, but page 0 is a 400. Every link has to be one
  // the API accepts, so `last` never points below page 1.
  const lastPage = Math.max(totalPages, 1);

  function link(pageNumber: number): string {
    // URLSearchParams, not string concatenation. A tag may be written with
    // its "#", and an unescaped "#" would end the query string right there.
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) {
        params.set(key, String(value));
      }
    }
    // Always written, defaults included, so a link keeps working if a
    // default ever changes.
    params.set("limit", String(limit));
    params.set("page", String(pageNumber));
    return `${path}?${params.toString()}`;
  }

  return {
    data: result.items,
    meta: {
      itemsPerPage: limit,
      totalItems: result.total,
      currentPage: page,
      totalPages,
    },
    links: {
      first: link(1),
      last: link(lastPage),
      current: link(page),
      // "<", not "!==". A page past the end has no next page either.
      next: page < totalPages ? link(page + 1) : null,
      // Past the end, this points back at the last page that has rows.
      previous: page > 1 ? link(Math.min(page - 1, lastPage)) : null,
    },
  };
}
