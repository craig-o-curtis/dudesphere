import { Test, TestingModule } from "@nestjs/testing";

import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

// These tests check that each handler passes the right arguments to the
// service and returns its result unchanged. Pipes, status codes and
// serialization only run on a real HTTP request, so they belong in e2e tests.
describe("UsersController", () => {
  let controller: UsersController;

  const usersService = {
    getUsers: vi.fn(),
    getUserById: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    restoreUser: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: vi.fn(() => true) })
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("getUsers", () => {
    // 5 and 2 differ from the defaults (10 and 1), and from each other, so a
    // swapped or dropped argument shows up as a failure.
    it("passes limit and page to the service in that order and returns its result", async () => {
      const users = [{ id: 1, username: "dude" }];
      usersService.getUsers.mockResolvedValue(users);

      const result = await controller.getUsers(5, 2);

      expect(usersService.getUsers).toHaveBeenCalledWith(5, 2);
      expect(result).toBe(users);
    });
  });

  describe("getUserById", () => {
    it("passes the id to the service and returns its result", async () => {
      const user = { id: 7, username: "walter" };
      usersService.getUserById.mockResolvedValue(user);

      const result = await controller.getUserById(7);

      expect(usersService.getUserById).toHaveBeenCalledWith(7);
      expect(result).toBe(user);
    });
  });

  describe("createUser", () => {
    it("passes the body to the service and returns its result", async () => {
      const body = { username: "dude", email: "d@x.com", password: "secret1" };
      const created = { id: 42, username: "dude", email: "d@x.com" };
      usersService.createUser.mockResolvedValue(created);

      const result = await controller.createUser(body);

      expect(usersService.createUser).toHaveBeenCalledWith(body);
      expect(result).toBe(created);
    });
  });

  describe("updateUser", () => {
    it("passes the id from the URL and the body to the service and returns its result", async () => {
      const body = { username: "walter" };
      const updated = { id: 7, username: "walter" };
      usersService.updateUser.mockResolvedValue(updated);

      const result = await controller.updateUser(7, body);

      expect(usersService.updateUser).toHaveBeenCalledWith(7, body);
      expect(result).toBe(updated);
    });
  });

  describe("deleteMe", () => {
    it("deletes the user on the request, not one from the URL", async () => {
      // resolve as undefined because the return type is void
      usersService.deleteUser.mockResolvedValue(undefined);
      const mockUser = { userId: 25, username: "walter", role: "user" };

      await controller.deleteMe(mockUser);

      expect(usersService.deleteUser).toHaveBeenCalledWith(mockUser.userId);
    });
  });

  describe("deleteUser", () => {
    it("passes the id to the service and returns nothing", async () => {
      usersService.deleteUser.mockResolvedValue(undefined);

      const result = await controller.deleteUser(7);

      expect(usersService.deleteUser).toHaveBeenCalledWith(7);
      expect(result).toBeUndefined();
    });
  });

  describe("restoreUser", () => {
    it("passes the id to the service and returns the restored user", async () => {
      const restored = { id: 7, username: "walter" };
      usersService.restoreUser.mockResolvedValue(restored);

      const result = await controller.restoreUser(7);

      expect(usersService.restoreUser).toHaveBeenCalledWith(7);
      expect(result).toBe(restored);
    });
  });
});
