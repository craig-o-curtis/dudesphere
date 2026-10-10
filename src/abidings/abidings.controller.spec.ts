import { Test, TestingModule } from "@nestjs/testing";
import { Types } from "mongoose";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { PaginationProvider } from "../shared/pagination/pagination.provider.js";
import { UserRole } from "../users/user.entity.js";
import { AbidingsController } from "./abidings.controller.js";
import { AbidingsService } from "./abidings.service.js";

describe("AbidingsController", () => {
  let controller: AbidingsController;

  const abidingService = {
    getAbidings: vi.fn(),
    getAbidingsByUserId: vi.fn(),
    createAbiding: vi.fn(),
    patchAbiding: vi.fn(),
    deleteAbiding: vi.fn(),
  };

  // The user JwtAuthGuard puts on the request. The write routes pass it
  // straight through to the service, which owns the authorization rule.
  const caller = { userId: 25, username: "walter", role: UserRole.USER };

  // What GetAbidingsDto holds when the caller sends no limit or page.
  // The defaults come from the ValidationPipe, which does not run here.
  const firstPage = { limit: 10, page: 1 };

  // A service result: one page of abidings and the count of all of them.
  function pageOf<T>(items: T[], total = items.length) {
    return { items, total };
  }

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AbidingsController],
      providers: [
        { provide: AbidingsService, useValue: abidingService },
        // The real one: it has no dependencies, and it builds the links these tests read.
        PaginationProvider,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: vi.fn(() => true) })
      .compile();

    controller = module.get<AbidingsController>(AbidingsController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("getAbidings", () => {
    // The service returns each abiding as a response, with its hashtags and
    // its author's username. The controller must hand those on as they are:
    // a copy would lose the class, and ClassSerializerInterceptor reads the
    // class to apply the DTO's rules.
    it("puts the service's abidings in data without copying them", async () => {
      const first = { id: "a1", userId: 1, message: "easy #Sunday", username: "Admin" };
      const second = { id: "a2", userId: 25, message: "second", username: "walter" };
      abidingService.getAbidings.mockResolvedValue(pageOf([first, second]));

      const result = await controller.getAbidings({ ...firstPage });

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toBe(first);
      expect(result.data[1]).toBe(second);
    });

    // 5 and 2 differ from the defaults and from each other, so a swapped or
    // dropped value shows up as a failure.
    it("passes limit and page to the service and describes the page", async () => {
      abidingService.getAbidings.mockResolvedValue(
        pageOf([{ id: "a1", userId: 1, message: "first" }], 12),
      );

      const result = await controller.getAbidings({ limit: 5, page: 2 });

      expect(abidingService.getAbidings).toHaveBeenCalledWith(
        { limit: 5, page: 2 },
        { hashtags: [] },
      );
      expect(result.meta).toEqual({
        itemsPerPage: 5,
        totalItems: 12,
        currentPage: 2,
        totalPages: 3,
      });
      expect(result.links.next).toBe("/abidings?limit=5&page=3");
      expect(result.links.previous).toBe("/abidings?limit=5&page=1");
    });

    // Following `next` has to stay inside the filtered list.
    it("keeps userId and the tags in the links", async () => {
      abidingService.getAbidings.mockResolvedValue(pageOf([], 30));

      const result = await controller.getAbidings({
        ...firstPage,
        userId: 3,
        hashtag: "#sunday, dude",
      });

      expect(result.links.next).toBe("/abidings?userId=3&hashtag=%23sunday%2Cdude&limit=10&page=2");
    });

    it("passes the dates to the service and keeps them in the links", async () => {
      abidingService.getAbidings.mockResolvedValue(pageOf([], 30));
      const startDate = "2026-10-01T00:00:00Z";
      const endDate = "2026-10-08T00:00:00Z";

      const result = await controller.getAbidings({ ...firstPage, startDate, endDate });

      expect(abidingService.getAbidings).toHaveBeenCalledWith(firstPage, {
        startDate,
        endDate,
        hashtags: [],
      });
      expect(result.links.next).toBe(
        "/abidings?startDate=2026-10-01T00%3A00%3A00Z&endDate=2026-10-08T00%3A00%3A00Z&limit=10&page=2",
      );
    });

    // The controller only reads the param. Which query the tags need is the
    // service's decision, so every case below ends in the same one call.
    it("passes an empty tag list when no tag is given", async () => {
      abidingService.getAbidings.mockResolvedValue(pageOf([]));

      await controller.getAbidings({ ...firstPage });

      expect(abidingService.getAbidings).toHaveBeenCalledWith(firstPage, { hashtags: [] });
    });

    // A param of only separators leaves nothing usable, so it is the
    // unfiltered list rather than a search for an empty tag.
    it("ignores a hashtag param that is only commas and spaces", async () => {
      abidingService.getAbidings.mockResolvedValue(pageOf([]));

      const result = await controller.getAbidings({ ...firstPage, hashtag: " , , " });

      expect(abidingService.getAbidings).toHaveBeenCalledWith(firstPage, { hashtags: [] });
      // The list was not filtered, so its links say so too.
      expect(result.links.current).toBe("/abidings?limit=10&page=1");
    });

    it("passes one tag as a list of one", async () => {
      abidingService.getAbidings.mockResolvedValue(pageOf([]));

      await controller.getAbidings({ ...firstPage, hashtag: "sunday" });

      expect(abidingService.getAbidings).toHaveBeenCalledWith(firstPage, { hashtags: ["sunday"] });
    });

    it("splits comma-separated tags into a list", async () => {
      abidingService.getAbidings.mockResolvedValue(pageOf([]));

      await controller.getAbidings({ ...firstPage, hashtag: "sunday, dude" });

      expect(abidingService.getAbidings).toHaveBeenCalledWith(firstPage, {
        hashtags: ["sunday", "dude"],
      });
    });

    it("passes userId alongside the tags", async () => {
      abidingService.getAbidings.mockResolvedValue(pageOf([]));

      // A number now: GetAbidingsDto coerces and validates it, so the
      // controller no longer converts it by hand.
      await controller.getAbidings({ ...firstPage, hashtag: "sunday", userId: 3 });

      expect(abidingService.getAbidings).toHaveBeenCalledWith(firstPage, {
        userId: 3,
        hashtags: ["sunday"],
      });
    });
  });

  describe("getMyAbidings", () => {
    it("passes the id from the token, not a request param", async () => {
      const mine = { id: "a1", userId: 25, message: "mine", username: "walter" };
      abidingService.getAbidingsByUserId.mockResolvedValue(pageOf([mine]));
      const mockUser = { userId: 25, username: "walter", role: UserRole.USER };

      const result = await controller.getMyAbidings(mockUser, { ...firstPage });

      expect(abidingService.getAbidingsByUserId).toHaveBeenCalledWith(25, firstPage);
      expect(result.data[0]).toBe(mine);
    });

    it("passes limit and page to the service and links back to /abidings/me", async () => {
      abidingService.getAbidingsByUserId.mockResolvedValue(pageOf([], 12));
      const mockUser = { userId: 25, username: "walter", role: UserRole.USER };

      const result = await controller.getMyAbidings(mockUser, { limit: 5, page: 2 });

      expect(abidingService.getAbidingsByUserId).toHaveBeenCalledWith(25, { limit: 5, page: 2 });
      expect(result.meta.totalItems).toBe(12);
      expect(result.links.next).toBe("/abidings/me?limit=5&page=3");
    });
  });

  describe("postAbiding", () => {
    // The service checks that the author still exists and puts their username
    // on the response. Both are tested in abiding.service.spec.ts.
    it("passes the body and the caller to the service and returns its response", async () => {
      const created = { id: "a1", userId: 25, message: "new", username: "walter" };
      abidingService.createAbiding.mockResolvedValue(created);

      const result = await controller.postAbiding({ message: "new" }, caller);

      expect(abidingService.createAbiding).toHaveBeenCalledWith({ message: "new" }, caller);
      expect(result).toBe(created);
    });
  });

  describe("patchAbiding", () => {
    // The id param is a Types.ObjectId, because that is what ParseObjectIdPipe
    // hands the route. The service takes the string form. That the pipe is
    // actually bound to the route is proved in abidings.controller.http.spec.ts,
    // since pipes do not run on a direct method call like this one.
    it("passes the id as a string and returns the service's response", async () => {
      const id = new Types.ObjectId("6ac543e3d91134719299fe49");
      const edited = { id: "a1", userId: 25, message: "edited", username: "walter" };
      abidingService.patchAbiding.mockResolvedValue(edited);

      const result = await controller.patchAbiding(id, { message: "edited" }, caller);

      expect(abidingService.patchAbiding).toHaveBeenCalledWith(
        "6ac543e3d91134719299fe49",
        { message: "edited" },
        caller,
      );
      expect(result).toBe(edited);
    });
  });
});
