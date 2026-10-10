import type { Model } from "mongoose";

import { findMongoPage } from "./mongo-page.js";

interface Tag {
  slug: string;
}

describe("findMongoPage", () => {
  // A list query is a chain: find().sort().skip().limit().exec(). Each step
  // returns the same query, so a test can ask what any of them was called with.
  function listQueryOf<T>(value: T) {
    const query = {
      sort: vi.fn(),
      skip: vi.fn(),
      limit: vi.fn(),
      exec: vi.fn().mockResolvedValue(value),
    };
    query.sort.mockReturnValue(query);
    query.skip.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    return query;
  }

  const model = {
    find: vi.fn(),
    countDocuments: vi.fn(),
  };
  // The function only calls find and countDocuments, so the fake holds only
  // those. The cast is what lets it stand in for a full Mongoose model.
  const tagModel = model as unknown as Model<Tag>;

  const firstPage = { limit: 10, page: 1 };

  beforeEach(() => {
    vi.resetAllMocks();
    model.find.mockReturnValue(listQueryOf([]));
    model.countDocuments.mockReturnValue({ exec: vi.fn().mockResolvedValue(0) });
  });

  it("returns the page's documents and the count of all that match", async () => {
    const documents = [{ slug: "dude" }, { slug: "sunday" }];
    model.find.mockReturnValue(listQueryOf(documents));
    model.countDocuments.mockReturnValue({ exec: vi.fn().mockResolvedValue(42) });

    const page = await findMongoPage(tagModel, {}, { slug: 1 }, firstPage);

    // toBe: the documents as Mongoose returned them. Mapping is the caller's job.
    expect(page.items).toBe(documents);
    expect(page.total).toBe(42);
  });

  it("sorts with the sort it is given", async () => {
    const query = listQueryOf([]);
    model.find.mockReturnValue(query);

    await findMongoPage(tagModel, {}, { createdAt: -1, _id: -1 }, firstPage);

    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
  });

  // 5 and 3 differ from the defaults and from each other, so a swapped or
  // dropped value shows up as a failure.
  it("reads one page: skips the earlier pages and stops at the limit", async () => {
    const query = listQueryOf([]);
    model.find.mockReturnValue(query);

    await findMongoPage(tagModel, {}, { slug: 1 }, { limit: 5, page: 3 });

    expect(query.skip).toHaveBeenCalledWith(10);
    expect(query.limit).toHaveBeenCalledWith(5);
  });

  // The total has to describe the list the caller is paging through. toBe,
  // not toEqual: it is the one filter object, handed to both queries.
  it("counts with the same filter it reads with", async () => {
    const filter = { slug: "dude" };

    await findMongoPage(tagModel, filter, { slug: 1 }, firstPage);

    expect(model.find.mock.calls[0][0]).toBe(filter);
    expect(model.countDocuments.mock.calls[0][0]).toBe(filter);
  });

  it("returns no documents and a total of 0 when nothing matches", async () => {
    const page = await findMongoPage(tagModel, {}, { slug: 1 }, firstPage);

    expect(page).toEqual({ items: [], total: 0 });
  });
});
