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

/** The body of every list route. PaginationProvider.toResponse builds it. */
export interface Paginated<T> {
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
    // null on the last page, and on a page past the end.
    next: string | null;
    // null on page 1.
    previous: string | null;
  };
}
