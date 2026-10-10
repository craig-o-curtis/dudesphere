import { Test, TestingModule } from "@nestjs/testing";
import type { Model } from "mongoose";
import type { Repository } from "typeorm";

import { PaginationProvider } from "./pagination.provider.js";

describe("PaginationProvider", () => {
  let provider: PaginationProvider;

  const firstPage = { limit: 10, page: 1 };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PaginationProvider],
    }).compile();

    provider = module.get<PaginationProvider>(PaginationProvider);
  });

  it("should be defined", () => {
    expect(provider).toBeDefined();
  });

  describe("paginateQuery", () => {
    interface Row {
      id: number;
    }

    const repository = { findAndCount: vi.fn() };
    // The method only calls findAndCount, so the fake holds only that. The
    // cast is what lets it stand in for a full TypeORM repository.
    const rowRepository = repository as unknown as Repository<Row>;

    beforeEach(() => {
      vi.resetAllMocks();
      repository.findAndCount.mockResolvedValue([[], 0]);
    });

    it("returns the page's rows and the count of all that match", async () => {
      const rows = [{ id: 1 }, { id: 2 }];
      repository.findAndCount.mockResolvedValue([rows, 42]);

      const page = await provider.paginateQuery(firstPage, rowRepository, { order: { id: "ASC" } });

      // toBe: the rows as TypeORM returned them. Mapping is the caller's job.
      expect(page.items).toBe(rows);
      expect(page.total).toBe(42);
    });

    it("skips nothing on page 1", async () => {
      await provider.paginateQuery(firstPage, rowRepository, { order: { id: "ASC" } });

      expect(repository.findAndCount).toHaveBeenCalledWith({
        order: { id: "ASC" },
        skip: 0,
        take: 10,
      });
    });

    // 5 and 3 differ from the defaults and from each other, so a swapped or
    // dropped value shows up as a failure.
    it("reads one page: skips the earlier pages and stops at the limit", async () => {
      await provider.paginateQuery({ limit: 5, page: 3 }, rowRepository, { order: { id: "ASC" } });

      expect(repository.findAndCount).toHaveBeenCalledWith({
        order: { id: "ASC" },
        skip: 10,
        take: 5,
      });
    });

    // One call does the page and the count, so the total describes the list
    // the caller is paging through.
    it("passes the caller's other find options through", async () => {
      await provider.paginateQuery(firstPage, rowRepository, {
        where: { id: 7 },
        order: { id: "DESC" },
        withDeleted: true,
      });

      expect(repository.findAndCount).toHaveBeenCalledWith({
        where: { id: 7 },
        order: { id: "DESC" },
        withDeleted: true,
        skip: 0,
        take: 10,
      });
    });
  });

  describe("paginateModel", () => {
    interface Tag {
      slug: string;
    }

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
    // The method only calls find and countDocuments, so the fake holds only
    // those. The cast is what lets it stand in for a full Mongoose model.
    const tagModel = model as unknown as Model<Tag>;

    beforeEach(() => {
      vi.resetAllMocks();
      model.find.mockReturnValue(listQueryOf([]));
      model.countDocuments.mockReturnValue({ exec: vi.fn().mockResolvedValue(0) });
    });

    it("returns the page's documents and the count of all that match", async () => {
      const documents = [{ slug: "dude" }, { slug: "sunday" }];
      model.find.mockReturnValue(listQueryOf(documents));
      model.countDocuments.mockReturnValue({ exec: vi.fn().mockResolvedValue(42) });

      const page = await provider.paginateModel(firstPage, tagModel, {}, { slug: 1 });

      // toBe: the documents as Mongoose returned them. Mapping is the caller's job.
      expect(page.items).toBe(documents);
      expect(page.total).toBe(42);
    });

    it("sorts with the sort it is given", async () => {
      const query = listQueryOf([]);
      model.find.mockReturnValue(query);

      await provider.paginateModel(firstPage, tagModel, {}, { createdAt: -1, _id: -1 });

      expect(query.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    });

    it("skips nothing on page 1", async () => {
      const query = listQueryOf([]);
      model.find.mockReturnValue(query);

      await provider.paginateModel(firstPage, tagModel, {}, { slug: 1 });

      expect(query.skip).toHaveBeenCalledWith(0);
    });

    // 5 and 3 differ from the defaults and from each other, so a swapped or
    // dropped value shows up as a failure.
    it("reads one page: skips the earlier pages and stops at the limit", async () => {
      const query = listQueryOf([]);
      model.find.mockReturnValue(query);

      await provider.paginateModel({ limit: 5, page: 3 }, tagModel, {}, { slug: 1 });

      expect(query.skip).toHaveBeenCalledWith(10);
      expect(query.limit).toHaveBeenCalledWith(5);
    });

    // The total has to describe the list the caller is paging through. toBe,
    // not toEqual: it is the one filter object, handed to both queries.
    it("counts with the same filter it reads with", async () => {
      const filter = { slug: "dude" };

      await provider.paginateModel(firstPage, tagModel, filter, { slug: 1 });

      expect(model.find.mock.calls[0][0]).toBe(filter);
      expect(model.countDocuments.mock.calls[0][0]).toBe(filter);
    });

    it("returns no documents and a total of 0 when nothing matches", async () => {
      const page = await provider.paginateModel(firstPage, tagModel, {}, { slug: 1 });

      expect(page).toEqual({ items: [], total: 0 });
    });
  });

  describe("toResponse", () => {
    const items = ["a", "b"];

    it("describes a page in the middle of a list", () => {
      const response = provider.toResponse(
        { items, total: 1000 },
        { limit: 10, page: 3 },
        "/users",
      );

      expect(response).toEqual({
        data: items,
        meta: { itemsPerPage: 10, totalItems: 1000, currentPage: 3, totalPages: 100 },
        links: {
          first: "/users?limit=10&page=1",
          last: "/users?limit=10&page=100",
          current: "/users?limit=10&page=3",
          next: "/users?limit=10&page=4",
          previous: "/users?limit=10&page=2",
        },
      });
    });

    // The same array, not a copy. A copy made with spread or map would lose
    // each item's class, and the serializer needs it.
    it("passes the items through untouched", () => {
      const response = provider.toResponse({ items, total: 2 }, firstPage, "/users");

      expect(response.data).toBe(items);
    });

    it("rounds a part-filled last page up", () => {
      const { meta } = provider.toResponse({ items, total: 21 }, firstPage, "/users");

      expect(meta.totalPages).toBe(3);
    });

    it("has no previous link on page 1", () => {
      const { links } = provider.toResponse({ items, total: 30 }, firstPage, "/users");

      expect(links.previous).toBeNull();
      expect(links.next).toBe("/users?limit=10&page=2");
    });

    it("has no next link on the last page", () => {
      const { links } = provider.toResponse({ items, total: 30 }, { limit: 10, page: 3 }, "/users");

      expect(links.next).toBeNull();
      expect(links.previous).toBe("/users?limit=10&page=2");
    });

    // Page 0 is a 400, so `last` must not point at it.
    it("points every link at page 1 when the list is empty", () => {
      const response = provider.toResponse({ items: [], total: 0 }, firstPage, "/users");

      expect(response.meta).toEqual({
        itemsPerPage: 10,
        totalItems: 0,
        currentPage: 1,
        totalPages: 0,
      });
      expect(response.links).toEqual({
        first: "/users?limit=10&page=1",
        last: "/users?limit=10&page=1",
        current: "/users?limit=10&page=1",
        next: null,
        previous: null,
      });
    });

    it("sends a page past the end back to the last page that has rows", () => {
      const { links } = provider.toResponse(
        { items: [], total: 30 },
        { limit: 10, page: 999 },
        "/users",
      );

      expect(links.next).toBeNull();
      expect(links.previous).toBe("/users?limit=10&page=3");
      expect(links.current).toBe("/users?limit=10&page=999");
    });

    it("carries the route's filters in every link, ahead of limit and page", () => {
      const { links } = provider.toResponse(
        { items, total: 30 },
        { limit: 10, page: 2 },
        "/abidings",
        { userId: 7, hashtag: "dude" },
      );

      expect(links.first).toBe("/abidings?userId=7&hashtag=dude&limit=10&page=1");
      expect(links.next).toBe("/abidings?userId=7&hashtag=dude&limit=10&page=3");
      expect(links.previous).toBe("/abidings?userId=7&hashtag=dude&limit=10&page=1");
    });

    it("leaves out a filter that was not given", () => {
      const { links } = provider.toResponse({ items, total: 2 }, firstPage, "/abidings", {
        userId: undefined,
        hashtag: "dude",
      });

      expect(links.current).toBe("/abidings?hashtag=dude&limit=10&page=1");
    });

    // An unescaped "#" starts the URL fragment, so everything after it,
    // limit and page included, would be dropped by whoever follows the link.
    it("escapes a tag written with its #", () => {
      const { links } = provider.toResponse({ items, total: 30 }, firstPage, "/abidings", {
        hashtag: "#dude,#sunday",
      });

      expect(links.next).toBe("/abidings?hashtag=%23dude%2C%23sunday&limit=10&page=2");
      expect(new URL(links.next ?? "", "http://localhost").searchParams.get("hashtag")).toBe(
        "#dude,#sunday",
      );
    });
  });
});
