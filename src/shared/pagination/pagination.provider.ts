import { Injectable } from "@nestjs/common";
import type { HydratedDocument, Model, QueryFilter } from "mongoose";
import type { FindManyOptions, FindOptionsOrder, ObjectLiteral, Repository } from "typeorm";

import type { Page, Paginated, PageRequest } from "./paginated.interface.js";

/**
 * What paginatePgQuery takes besides the page: any TypeORM find option except
 * `skip` and `take`, which it sets itself. `order` is required, because a
 * paged query with no fixed order can repeat a row on two pages or skip one.
 */
export type PageFindOptions<TEntity> = Omit<FindManyOptions<TEntity>, "skip" | "take" | "order"> & {
  order: FindOptionsOrder<TEntity>;
};

/**
 * Everything a list route needs to page its rows. It has two halves, one for
 * each layer:
 *
 * - A service calls `paginatePgQuery` (Postgres) or `paginateMongoModel` (Mongo). It
 *   hands over its repository or model and gets back one page of rows and the
 *   count of all of them.
 * - A controller calls `toResponse` with that page and its own route path,
 *   and gets back the body the route answers with.
 *
 * It does not read the request. A provider that injects REQUEST is created
 * again for every request, and so is every service that depends on it. The
 * controller already knows its path, so it passes it.
 */
@Injectable()
export class PaginationProvider {
  /**
   * One page of the rows a TypeORM query matches, and the count of all of
   * them. Every Postgres list goes through this.
   *
   * `findAndCount` runs both halves with the same `where`, so the total always
   * describes the list the caller is paging through.
   *
   * It returns entities, not DTOs. The caller maps them, because only the
   * caller knows its response class.
   */
  async paginatePgQuery<TEntity extends ObjectLiteral>(
    pageRequest: PageRequest,
    repository: Repository<TEntity>,
    options: PageFindOptions<TEntity>,
  ): Promise<Page<TEntity>> {
    const [items, total] = await repository.findAndCount({
      ...options,
      skip: this.toSkip(pageRequest),
      take: pageRequest.limit,
    });
    return { items, total };
  }

  /**
   * One page of the documents a filter matches, and the count of all of them.
   * Every Mongo list goes through this.
   *
   * TypeORM's `findAndCount` does both halves in one call. Mongoose has
   * nothing like it, so this is the pair written once.
   *
   * It makes two rules hard to break:
   *
   * - `sort` is a required argument. A paged query with no fixed order can
   *   repeat a document on two pages or skip one. Pass a sort with no ties: a
   *   unique field, or `_id` as the last key.
   * - The count uses the same `filter` as the page, because there is only one.
   *   So the total always describes the list the caller is paging through.
   *
   * The two queries run side by side, not in a transaction. A document written
   * between them can leave the total one ahead of the page, which a list can
   * live with.
   *
   * The count is the costly half, and that is accepted, not solved. A page can
   * come off an index, but no index here holds deletedAt, so the count reads
   * every document the filter matches: the whole collection when the filter is
   * only `{ deletedAt: null }`. The response shape needs a total, so it is paid
   * on every request. The query time limit in src/app.module.ts bounds it. If a
   * collection grows large, the fix is a stored count or a cursor with no
   * total, not another index: Mongo cannot count `{ deletedAt: null }` from an
   * index alone.
   *
   * It returns documents, not DTOs. The caller maps them, because only the
   * caller knows its response class.
   */
  async paginateMongoModel<TDocument>(
    pageRequest: PageRequest,
    model: Model<TDocument>,
    filter: QueryFilter<TDocument>,
    sort: Record<string, 1 | -1>,
  ): Promise<Page<HydratedDocument<TDocument>>> {
    const [items, total] = await Promise.all([
      model.find(filter).sort(sort).skip(this.toSkip(pageRequest)).limit(pageRequest.limit).exec(),
      model.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  /**
   * Builds the body of a list route from one page of rows.
   *
   * Called by the controller. The service runs its own query and returns a
   * Page; nothing here knows which database it came from.
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
  toResponse<T>(
    page: Page<T>,
    { limit, page: pageNumber }: PageRequest,
    path: string,
    filters: Record<string, string | number | undefined> = {},
  ): Paginated<T> {
    const totalPages = Math.ceil(page.total / limit);
    // An empty list has no pages, but page 0 is a 400. Every link has to be one
    // the API accepts, so `last` never points below page 1.
    const lastPage = Math.max(totalPages, 1);

    function link(target: number): string {
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
      params.set("page", String(target));
      return `${path}?${params.toString()}`;
    }

    return {
      data: page.items,
      meta: {
        itemsPerPage: limit,
        totalItems: page.total,
        currentPage: pageNumber,
        totalPages,
      },
      links: {
        first: link(1),
        last: link(lastPage),
        current: link(pageNumber),
        // "<", not "!==". A page past the end has no next page either.
        next: pageNumber < totalPages ? link(pageNumber + 1) : null,
        // Past the end, this points back at the last page that has rows.
        previous: pageNumber > 1 ? link(Math.min(pageNumber - 1, lastPage)) : null,
      },
    };
  }

  /** How many rows come before the requested page: OFFSET in Postgres, skip in Mongo. */
  private toSkip({ limit, page }: PageRequest): number {
    return (page - 1) * limit;
  }
}
