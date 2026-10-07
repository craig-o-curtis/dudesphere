import { Test, TestingModule } from "@nestjs/testing";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { UserRole } from "../users/user.entity.js";
import { UsersService } from "../users/users.service.js";
import { AbidingsController } from "./abidings.controller.js";
import { AbidingsService } from "./abidings.service.js";

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
  };

  // The user JwtAuthGuard puts on the request. The write routes pass it
  // straight through to the service, which owns the authorization rule.
  const caller = { userId: 25, username: "walter", role: UserRole.USER };

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
      abidingService.getAbidings.mockResolvedValue([
        { id: "a1", userId: 1, message: "first" },
        { id: "a2", userId: 1, message: "second" },
        { id: "a3", userId: 25, message: "third" },
      ]);
      usersService.getUsersByIds.mockResolvedValue([]);

      await controller.getAbidings({});

      expect(usersService.getUsersByIds).toHaveBeenCalledWith([1, 25]);
    });

    it("fills in each abiding's username from its author", async () => {
      abidingService.getAbidings.mockResolvedValue([
        { id: "a1", userId: 1, message: "first" },
        { id: "a2", userId: 25, message: "second" },
      ]);
      usersService.getUsersByIds.mockResolvedValue([
        { id: 1, username: "Admin" },
        { id: 25, username: "walter" },
      ]);

      const result = await controller.getAbidings({});

      expect(result.map((a) => a.username)).toEqual(["Admin", "walter"]);
    });

    it("falls back to Unknown when the author is not found", async () => {
      abidingService.getAbidings.mockResolvedValue([{ id: "a1", userId: 99, message: "orphan" }]);
      usersService.getUsersByIds.mockResolvedValue([]);

      const result = await controller.getAbidings({});

      expect(result[0].username).toBe("Unknown");
    });

    // The response DTO is what a client actually receives, so the derived
    // tags have to survive the mapping out of the service.
    it("returns each abiding's hashtags in the response", async () => {
      abidingService.getAbidings.mockResolvedValue([
        { id: "a1", userId: 1, message: "easy #Sunday", hashtags: ["sunday"] },
      ]);
      usersService.getUsersByIds.mockResolvedValue([{ id: 1, username: "Admin" }]);

      const result = await controller.getAbidings({});

      expect(result[0].hashtags).toEqual(["sunday"]);
    });

    it("returns an empty hashtags array for an abiding written before the field existed", async () => {
      abidingService.getAbidings.mockResolvedValue([{ id: "a1", userId: 1, message: "old" }]);
      usersService.getUsersByIds.mockResolvedValue([{ id: 1, username: "Admin" }]);

      const result = await controller.getAbidings({});

      expect(result[0].hashtags).toEqual([]);
    });

    it("calls getAbidings, not a hashtag method, when no tag is given", async () => {
      abidingService.getAbidings.mockResolvedValue([]);

      await controller.getAbidings({});

      expect(abidingService.getAbidings).toHaveBeenCalledWith(undefined);
      expect(abidingService.getAbidingsByHashtag).not.toHaveBeenCalled();
      expect(abidingService.getAbidingsByHashtags).not.toHaveBeenCalled();
    });

    // A param of only separators leaves nothing usable, so it must fall
    // through to the unfiltered list rather than query for an empty tag.
    it("ignores a hashtag param that is only commas and spaces", async () => {
      abidingService.getAbidings.mockResolvedValue([]);

      await controller.getAbidings({ hashtag: " , , " });

      expect(abidingService.getAbidings).toHaveBeenCalledWith(undefined);
      expect(abidingService.getAbidingsByHashtag).not.toHaveBeenCalled();
      expect(abidingService.getAbidingsByHashtags).not.toHaveBeenCalled();
    });

    it("dispatches a single hashtag to getAbidingsByHashtag", async () => {
      abidingService.getAbidingsByHashtag.mockResolvedValue([]);

      await controller.getAbidings({ hashtag: "sunday" });

      expect(abidingService.getAbidingsByHashtag).toHaveBeenCalledWith("sunday", undefined);
      expect(abidingService.getAbidings).not.toHaveBeenCalled();
      expect(abidingService.getAbidingsByHashtags).not.toHaveBeenCalled();
    });

    it("dispatches comma-separated hashtags to getAbidingsByHashtags", async () => {
      abidingService.getAbidingsByHashtags.mockResolvedValue([]);

      await controller.getAbidings({ hashtag: "sunday, dude" });

      expect(abidingService.getAbidingsByHashtags).toHaveBeenCalledWith(
        ["sunday", "dude"],
        undefined,
      );
      expect(abidingService.getAbidings).not.toHaveBeenCalled();
      expect(abidingService.getAbidingsByHashtag).not.toHaveBeenCalled();
    });

    it("passes userId through to getAbidingsByHashtag", async () => {
      abidingService.getAbidingsByHashtag.mockResolvedValue([]);

      await controller.getAbidings({ hashtag: "sunday", userId: "3" });

      expect(abidingService.getAbidingsByHashtag).toHaveBeenCalledWith("sunday", 3);
    });
  });

  describe("getMyAbidings", () => {
    it("passes the id from the token, not a request param, and fills in usernames", async () => {
      abidingService.getAbidingsByUserId.mockResolvedValue([
        { id: "a1", userId: 25, message: "mine" },
      ]);
      usersService.getUsersByIds.mockResolvedValue([{ id: 25, username: "walter" }]);
      const mockUser = { userId: 25, username: "walter", role: UserRole.USER };

      const result = await controller.getMyAbidings(mockUser);

      expect(abidingService.getAbidingsByUserId).toHaveBeenCalledWith(25);
      expect(result[0].username).toBe("walter");
    });
  });

  // These used to load the first page of users and search it, so an author
  // past that page came back as "Unknown".
  describe("postAbiding", () => {
    it("looks up the author by id and returns their username", async () => {
      abidingService.createAbiding.mockResolvedValue({ id: "a1", userId: 25, message: "new" });
      usersService.getUsersByIds.mockResolvedValue([{ id: 25, username: "walter" }]);

      const result = await controller.postAbiding({ message: "new" }, caller);

      expect(usersService.getUsersByIds).toHaveBeenCalledWith([25]);
      expect(result.username).toBe("walter");
    });

    it("falls back to Unknown when the author is not found", async () => {
      abidingService.createAbiding.mockResolvedValue({ id: "a1", userId: 99, message: "new" });
      usersService.getUsersByIds.mockResolvedValue([]);

      const result = await controller.postAbiding({ message: "new" }, caller);

      expect(result.username).toBe("Unknown");
    });
  });

  describe("patchAbiding", () => {
    it("looks up the author by id and returns their username", async () => {
      abidingService.patchAbiding.mockResolvedValue({ id: "a1", userId: 25, message: "edited" });
      usersService.getUsersByIds.mockResolvedValue([{ id: 25, username: "walter" }]);

      const result = await controller.patchAbiding("a1", { message: "edited" }, caller);

      expect(abidingService.patchAbiding).toHaveBeenCalledWith("a1", { message: "edited" }, caller);
      expect(usersService.getUsersByIds).toHaveBeenCalledWith([25]);
      expect(result.username).toBe("walter");
    });
  });
});
