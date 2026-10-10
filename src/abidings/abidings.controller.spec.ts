import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Types } from "mongoose";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { UserRole } from "../users/user.entity.js";
import { UsersService } from "../users/users.service.js";
import { AbidingsController } from "./abidings.controller.js";
import { AbidingsService } from "./abidings.service.js";
import { AbidingResponseDto } from "./dto/abiding-response.dto.js";

describe("AbidingsController", () => {
  let controller: AbidingsController;

  const abidingService = {
    getAbidings: vi.fn(),
    getAbidingsByUserId: vi.fn(),
    getAbidingsByHashtag: vi.fn(),
    getAbidingsByHashtags: vi.fn(),
    createAbiding: vi.fn(),
    patchAbiding: vi.fn(),
    deleteAbiding: vi.fn(),
  };

  const usersService = {
    getUsersByIds: vi.fn(),
    getMyUser: vi.fn(),
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
        { provide: UsersService, useValue: usersService },
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
    // The old code loaded the first 20 users without checking who wrote what.
    // This checks that it now asks for exactly the authors it needs.
    it("asks for exactly the authors of the abidings, once each", async () => {
      abidingService.getAbidings.mockResolvedValue(
        pageOf([
          { id: "a1", userId: 1, message: "first" },
          { id: "a2", userId: 1, message: "second" },
          { id: "a3", userId: 25, message: "third" },
        ]),
      );
      usersService.getUsersByIds.mockResolvedValue([]);

      await controller.getAbidings({ ...firstPage });

      expect(usersService.getUsersByIds).toHaveBeenCalledWith([1, 25]);
    });

    it("fills in each abiding's username from its author", async () => {
      abidingService.getAbidings.mockResolvedValue(
        pageOf([
          { id: "a1", userId: 1, message: "first" },
          { id: "a2", userId: 25, message: "second" },
        ]),
      );
      usersService.getUsersByIds.mockResolvedValue([
        { id: 1, username: "Admin" },
        { id: 25, username: "walter" },
      ]);

      const result = await controller.getAbidings({ ...firstPage });

      expect(result.data.map((a) => a.username)).toEqual(["Admin", "walter"]);
    });

    it("falls back to Unknown when the author is not found", async () => {
      abidingService.getAbidings.mockResolvedValue(
        pageOf([{ id: "a1", userId: 99, message: "orphan" }]),
      );
      usersService.getUsersByIds.mockResolvedValue([]);

      const result = await controller.getAbidings({ ...firstPage });

      expect(result.data[0].username).toBe("Unknown");
    });

    // The response DTO is what a client actually receives, so the derived
    // tags have to survive the mapping out of the service.
    it("returns each abiding's hashtags in the response", async () => {
      abidingService.getAbidings.mockResolvedValue(
        pageOf([{ id: "a1", userId: 1, message: "easy #Sunday", hashtags: ["sunday"] }]),
      );
      usersService.getUsersByIds.mockResolvedValue([{ id: 1, username: "Admin" }]);

      const result = await controller.getAbidings({ ...firstPage });

      expect(result.data[0].hashtags).toEqual(["sunday"]);
    });

    it("returns an empty hashtags array for an abiding written before the field existed", async () => {
      abidingService.getAbidings.mockResolvedValue(
        pageOf([{ id: "a1", userId: 1, message: "old" }]),
      );
      usersService.getUsersByIds.mockResolvedValue([{ id: 1, username: "Admin" }]);

      const result = await controller.getAbidings({ ...firstPage });

      expect(result.data[0].hashtags).toEqual([]);
    });

    // ClassSerializerInterceptor reads each item's class to apply the DTO's
    // rules. A plain object in `data` would skip them.
    it("returns real AbidingResponseDto instances inside data", async () => {
      abidingService.getAbidings.mockResolvedValue(
        pageOf([{ id: "a1", userId: 1, message: "first" }]),
      );
      usersService.getUsersByIds.mockResolvedValue([{ id: 1, username: "Admin" }]);

      const result = await controller.getAbidings({ ...firstPage });

      expect(result.data[0]).toBeInstanceOf(AbidingResponseDto);
    });

    // 5 and 2 differ from the defaults and from each other, so a swapped or
    // dropped value shows up as a failure.
    it("passes limit and page to the service and describes the page", async () => {
      abidingService.getAbidings.mockResolvedValue(
        pageOf([{ id: "a1", userId: 1, message: "first" }], 12),
      );
      usersService.getUsersByIds.mockResolvedValue([]);

      const result = await controller.getAbidings({ limit: 5, page: 2 });

      expect(abidingService.getAbidings).toHaveBeenCalledWith({ limit: 5, page: 2 }, {});
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
      abidingService.getAbidingsByHashtags.mockResolvedValue(pageOf([], 30));
      usersService.getUsersByIds.mockResolvedValue([]);

      const result = await controller.getAbidings({
        ...firstPage,
        userId: 3,
        hashtag: "#sunday, dude",
      });

      expect(result.links.next).toBe("/abidings?userId=3&hashtag=%23sunday%2Cdude&limit=10&page=2");
    });

    it("passes the dates to the service and keeps them in the links", async () => {
      abidingService.getAbidings.mockResolvedValue(pageOf([], 30));
      usersService.getUsersByIds.mockResolvedValue([]);
      const startDate = "2026-10-01T00:00:00Z";
      const endDate = "2026-10-08T00:00:00Z";

      const result = await controller.getAbidings({ ...firstPage, startDate, endDate });

      expect(abidingService.getAbidings).toHaveBeenCalledWith(firstPage, { startDate, endDate });
      expect(result.links.next).toBe(
        "/abidings?startDate=2026-10-01T00%3A00%3A00Z&endDate=2026-10-08T00%3A00%3A00Z&limit=10&page=2",
      );
    });

    it("calls getAbidings, not a hashtag method, when no tag is given", async () => {
      abidingService.getAbidings.mockResolvedValue(pageOf([]));

      await controller.getAbidings({ ...firstPage });

      expect(abidingService.getAbidings).toHaveBeenCalledWith(firstPage, {});
      expect(abidingService.getAbidingsByHashtag).not.toHaveBeenCalled();
      expect(abidingService.getAbidingsByHashtags).not.toHaveBeenCalled();
    });

    // A param of only separators leaves nothing usable, so it must fall
    // through to the unfiltered list rather than query for an empty tag.
    it("ignores a hashtag param that is only commas and spaces", async () => {
      abidingService.getAbidings.mockResolvedValue(pageOf([]));

      const result = await controller.getAbidings({ ...firstPage, hashtag: " , , " });

      expect(abidingService.getAbidings).toHaveBeenCalledWith(firstPage, {});
      expect(abidingService.getAbidingsByHashtag).not.toHaveBeenCalled();
      expect(abidingService.getAbidingsByHashtags).not.toHaveBeenCalled();
      // The list was not filtered, so its links say so too.
      expect(result.links.current).toBe("/abidings?limit=10&page=1");
    });

    it("dispatches a single hashtag to getAbidingsByHashtag", async () => {
      abidingService.getAbidingsByHashtag.mockResolvedValue(pageOf([]));

      await controller.getAbidings({ ...firstPage, hashtag: "sunday" });

      expect(abidingService.getAbidingsByHashtag).toHaveBeenCalledWith("sunday", firstPage, {});
      expect(abidingService.getAbidings).not.toHaveBeenCalled();
      expect(abidingService.getAbidingsByHashtags).not.toHaveBeenCalled();
    });

    it("dispatches comma-separated hashtags to getAbidingsByHashtags", async () => {
      abidingService.getAbidingsByHashtags.mockResolvedValue(pageOf([]));

      await controller.getAbidings({ ...firstPage, hashtag: "sunday, dude" });

      expect(abidingService.getAbidingsByHashtags).toHaveBeenCalledWith(
        ["sunday", "dude"],
        firstPage,
        {},
      );
      expect(abidingService.getAbidings).not.toHaveBeenCalled();
      expect(abidingService.getAbidingsByHashtag).not.toHaveBeenCalled();
    });

    it("passes userId through to getAbidingsByHashtag", async () => {
      abidingService.getAbidingsByHashtag.mockResolvedValue(pageOf([]));

      // A number now: GetAbidingsDto coerces and validates it, so the
      // controller no longer converts it by hand.
      await controller.getAbidings({ ...firstPage, hashtag: "sunday", userId: 3 });

      expect(abidingService.getAbidingsByHashtag).toHaveBeenCalledWith("sunday", firstPage, {
        userId: 3,
      });
    });
  });

  describe("getMyAbidings", () => {
    it("passes the id from the token, not a request param, and fills in usernames", async () => {
      abidingService.getAbidingsByUserId.mockResolvedValue(
        pageOf([{ id: "a1", userId: 25, message: "mine" }]),
      );
      usersService.getUsersByIds.mockResolvedValue([{ id: 25, username: "walter" }]);
      const mockUser = { userId: 25, username: "walter", role: UserRole.USER };

      const result = await controller.getMyAbidings(mockUser, { ...firstPage });

      expect(abidingService.getAbidingsByUserId).toHaveBeenCalledWith(25, firstPage);
      expect(result.data[0].username).toBe("walter");
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

  // These used to load the first page of users and search it, so an author
  // past that page came back as "Unknown".
  describe("postAbiding", () => {
    it("looks up the caller by the id in the token and returns their username", async () => {
      abidingService.createAbiding.mockResolvedValue({ id: "a1", userId: 25, message: "new" });
      usersService.getMyUser.mockResolvedValue({ id: 25, username: "walter" });

      const result = await controller.postAbiding({ message: "new" }, caller);

      expect(usersService.getMyUser).toHaveBeenCalledWith(25);
      expect(result.username).toBe("walter");
    });

    // A token outlives its user: it stays valid until it expires. Without
    // this, a deleted user could keep posting, and the abidings would be live.
    it("writes nothing when the caller's user is deleted or missing", async () => {
      usersService.getMyUser.mockRejectedValue(new NotFoundException("My User #25 not found"));

      await expect(controller.postAbiding({ message: "new" }, caller)).rejects.toThrow(
        NotFoundException,
      );
      expect(abidingService.createAbiding).not.toHaveBeenCalled();
    });
  });

  describe("patchAbiding", () => {
    // The id param is a Types.ObjectId, because that is what ParseObjectIdPipe
    // hands the route. The service takes the string form. That the pipe is
    // actually bound to the route is proved in abidings.controller.http.spec.ts,
    // since pipes do not run on a direct method call like this one.
    it("looks up the author by id and returns their username", async () => {
      const id = new Types.ObjectId("6ac543e3d91134719299fe49");
      abidingService.patchAbiding.mockResolvedValue({ id: "a1", userId: 25, message: "edited" });
      usersService.getUsersByIds.mockResolvedValue([{ id: 25, username: "walter" }]);

      const result = await controller.patchAbiding(id, { message: "edited" }, caller);

      expect(abidingService.patchAbiding).toHaveBeenCalledWith(
        "6ac543e3d91134719299fe49",
        { message: "edited" },
        caller,
      );
      expect(usersService.getUsersByIds).toHaveBeenCalledWith([25]);
      expect(result.username).toBe("walter");
    });
  });
});
