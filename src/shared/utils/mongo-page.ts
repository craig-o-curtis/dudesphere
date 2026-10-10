import type { HydratedDocument, Model, QueryFilter } from "mongoose";

import { type Page, type PageRequest, toSkip } from "../dto/paginated-response.js";

/**
 * One page of the documents a filter matches, and the count of all of them.
 * Every Mongo list goes through this.
 *
 * Postgres needs no twin. TypeORM's `findAndCount` already does both halves
 * in one call. Mongoose has nothing like it, so this is the pair written once.
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
export async function findMongoPage<TDocument>(
  model: Model<TDocument>,
  filter: QueryFilter<TDocument>,
  sort: Record<string, 1 | -1>,
  pageRequest: PageRequest,
): Promise<Page<HydratedDocument<TDocument>>> {
  const [items, total] = await Promise.all([
    model.find(filter).sort(sort).skip(toSkip(pageRequest)).limit(pageRequest.limit).exec(),
    model.countDocuments(filter).exec(),
  ]);
  return { items, total };
}
