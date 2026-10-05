import { Test, TestingModule } from "@nestjs/testing";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { UsersService } from "../users/users.service.js";
import { AbidingsController } from "./abidings.controller.js";
import { AbidingsService } from "./abidings.service.js";

describe("AbidingsController", () => {
  let controller: AbidingsController;

  const abidingService = {
    getAbidings: vi.fn(),
    getAbidingsByUserId: vi.fn(),
    createAbiding: vi.fn(),
    patchAbiding: vi.fn(),
  };

  const usersService = {
    getUsersByIds: vi.fn(),
  };

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

      await controller.getAbidings();

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

      const result = await controller.getAbidings();

      expect(result.map((a) => a.username)).toEqual(["Admin", "walter"]);
    });

    it("falls back to Unknown when the author is not found", async () => {
      abidingService.getAbidings.mockResolvedValue([{ id: "a1", userId: 99, message: "orphan" }]);
      usersService.getUsersByIds.mockResolvedValue([]);

      const result = await controller.getAbidings();

      expect(result[0].username).toBe("Unknown");
    });
  });

  describe("getMyAbidings", () => {
    it("passes the id from the token, not a request param, and fills in usernames", async () => {
      abidingService.getAbidingsByUserId.mockResolvedValue([
        { id: "a1", userId: 25, message: "mine" },
      ]);
      usersService.getUsersByIds.mockResolvedValue([{ id: 25, username: "walter" }]);
      const mockUser = { userId: 25, username: "walter", role: "user" };

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

      const result = await controller.postAbiding({ userId: "25", message: "new" });

      expect(usersService.getUsersByIds).toHaveBeenCalledWith([25]);
      expect(result.username).toBe("walter");
    });

    it("falls back to Unknown when the author is not found", async () => {
      abidingService.createAbiding.mockResolvedValue({ id: "a1", userId: 99, message: "new" });
      usersService.getUsersByIds.mockResolvedValue([]);

      const result = await controller.postAbiding({ userId: "99", message: "new" });

      expect(result.username).toBe("Unknown");
    });
  });

  describe("patchAbiding", () => {
    it("looks up the author by id and returns their username", async () => {
      abidingService.patchAbiding.mockResolvedValue({ id: "a1", userId: 25, message: "edited" });
      usersService.getUsersByIds.mockResolvedValue([{ id: 25, username: "walter" }]);

      const result = await controller.patchAbiding("a1", { message: "edited" });

      expect(usersService.getUsersByIds).toHaveBeenCalledWith([25]);
      expect(result.username).toBe("walter");
    });
  });
});
