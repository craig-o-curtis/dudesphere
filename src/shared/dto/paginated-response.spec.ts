import { toPaginatedResponse, toSkip } from "./paginated-response.js";

describe("toSkip", () => {
  it("skips nothing on page 1", () => {
    expect(toSkip({ limit: 10, page: 1 })).toBe(0);
  });

  it("skips the rows of every earlier page", () => {
    expect(toSkip({ limit: 5, page: 3 })).toBe(10);
  });
});

describe("toPaginatedResponse", () => {
  const items = ["a", "b"];

  it("describes a page in the middle of a list", () => {
    const response = toPaginatedResponse({ items, total: 1000 }, { limit: 10, page: 3 }, "/users");

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
    const response = toPaginatedResponse({ items, total: 2 }, { limit: 10, page: 1 }, "/users");

    expect(response.data).toBe(items);
  });

  it("rounds a part-filled last page up", () => {
    const { meta } = toPaginatedResponse({ items, total: 21 }, { limit: 10, page: 1 }, "/users");

    expect(meta.totalPages).toBe(3);
  });

  it("has no previous link on page 1", () => {
    const { links } = toPaginatedResponse({ items, total: 30 }, { limit: 10, page: 1 }, "/users");

    expect(links.previous).toBeNull();
    expect(links.next).toBe("/users?limit=10&page=2");
  });

  it("has no next link on the last page", () => {
    const { links } = toPaginatedResponse({ items, total: 30 }, { limit: 10, page: 3 }, "/users");

    expect(links.next).toBeNull();
    expect(links.previous).toBe("/users?limit=10&page=2");
  });

  // Page 0 is a 400, so `last` must not point at it.
  it("points every link at page 1 when the list is empty", () => {
    const response = toPaginatedResponse({ items: [], total: 0 }, { limit: 10, page: 1 }, "/users");

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
    const { links } = toPaginatedResponse(
      { items: [], total: 30 },
      { limit: 10, page: 999 },
      "/users",
    );

    expect(links.next).toBeNull();
    expect(links.previous).toBe("/users?limit=10&page=3");
    expect(links.current).toBe("/users?limit=10&page=999");
  });

  it("carries the route's filters in every link, ahead of limit and page", () => {
    const { links } = toPaginatedResponse(
      { items, total: 30 },
      { limit: 10, page: 2 },
      "/abidings",
      {
        userId: 7,
        hashtag: "dude",
      },
    );

    expect(links.first).toBe("/abidings?userId=7&hashtag=dude&limit=10&page=1");
    expect(links.next).toBe("/abidings?userId=7&hashtag=dude&limit=10&page=3");
    expect(links.previous).toBe("/abidings?userId=7&hashtag=dude&limit=10&page=1");
  });

  it("leaves out a filter that was not given", () => {
    const { links } = toPaginatedResponse(
      { items, total: 2 },
      { limit: 10, page: 1 },
      "/abidings",
      {
        userId: undefined,
        hashtag: "dude",
      },
    );

    expect(links.current).toBe("/abidings?hashtag=dude&limit=10&page=1");
  });

  // An unescaped "#" starts the URL fragment, so everything after it,
  // limit and page included, would be dropped by whoever follows the link.
  it("escapes a tag written with its #", () => {
    const { links } = toPaginatedResponse(
      { items, total: 30 },
      { limit: 10, page: 1 },
      "/abidings",
      {
        hashtag: "#dude,#sunday",
      },
    );

    expect(links.next).toBe("/abidings?hashtag=%23dude%2C%23sunday&limit=10&page=2");
    expect(new URL(links.next ?? "", "http://localhost").searchParams.get("hashtag")).toBe(
      "#dude,#sunday",
    );
  });
});
