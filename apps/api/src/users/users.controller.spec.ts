import { Test, TestingModule } from "@nestjs/testing";

import { NotOwnerException } from "../shared/exceptions/not-owner.exception.js";
import { PaginationProvider } from "../shared/pagination/pagination.provider.js";
import { type User, UserRole } from "./user.entity.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

// These tests check that each handler passes the right arguments to the
// service and returns its result unchanged. Pipes, status codes and
// serialization only run on a real HTTP request, so they belong in e2e tests.
describe("UsersController", () => {
  let controller: UsersController;

  // The member @CurrentUser() hands a handler: the User entity JwtAuth loaded.
  // The handlers here read only its id.
  const dude = { id: 25, username: "dude", role: UserRole.USER } as User;

  const usersService = {
    getUsers: vi.fn(),
    getUserById: vi.fn(),
    getUserForCaller: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    updateMyUser: vi.fn(),
    deleteUser: vi.fn(),
    restoreUser: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        // The real one: it has no dependencies, and it builds the links these tests read.
        PaginationProvider,
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("getUsers", () => {
    // 5 and 2 differ from the defaults (10 and 1), and from each other, so a
    // swapped or dropped value shows up as a failure.
    it("passes limit and page to the service and wraps its page", async () => {
      const users = [{ id: 1, username: "dude" }];
      usersService.getUsers.mockResolvedValue({ items: users, total: 12 });

      const result = await controller.getUsers({ limit: 5, page: 2 });

      expect(usersService.getUsers).toHaveBeenCalledWith({ limit: 5, page: 2 });
      // toBe: the service's own array, not a copy of it.
      expect(result.data).toBe(users);
      expect(result.meta).toEqual({
        itemsPerPage: 5,
        totalItems: 12,
        currentPage: 2,
        totalPages: 3,
      });
      expect(result.links.next).toBe("/users?limit=5&page=3");
    });
  });

  describe("getMyUser", () => {
    it("reads the user on the request", async () => {
      const user = { id: 25, username: "dude" };
      usersService.getUserById.mockResolvedValue(user);

      const result = await controller.getMyUser(dude);

      expect(usersService.getUserById).toHaveBeenCalledWith(25);
      expect(result).toBe(user);
    });
  });

  describe("getUserById", () => {
    it("passes the id and the caller to the service and returns its result", async () => {
      const user = { id: 7, username: "walter" };
      usersService.getUserForCaller.mockResolvedValue(user);

      const result = await controller.getUserById({ id: 7 }, dude);

      // getUserForCaller, not getUserById: it is the one that checks who is
      // asking. Calling getUserById here would hand any member any user.
      expect(usersService.getUserForCaller).toHaveBeenCalledWith(7, dude);
      expect(usersService.getUserById).not.toHaveBeenCalled();
      expect(result).toBe(user);
    });

    it("lets the service's refusal through", async () => {
      const refusal = new NotOwnerException("Not authorized to read this user");
      usersService.getUserForCaller.mockRejectedValue(refusal);

      await expect(controller.getUserById({ id: 7 }, dude)).rejects.toBe(refusal);
    });
  });

  describe("createUser", () => {
    it("passes the body to the service and returns its result", async () => {
      const body = {
        username: "dude",
        email: "d@x.com",
        password: "secret1",
        profile: { displayName: "The Dude" },
      };
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

      const result = await controller.updateUser({ id: 7 }, body);

      expect(usersService.updateUser).toHaveBeenCalledWith(7, body);
      expect(result).toBe(updated);
    });
  });

  describe("updateMyUser", () => {
    it("passes the user id from the token and the body to the service and returns its result", async () => {
      const body = { username: "newdude", password: "secret2", currentPassword: "secret1" };
      const updated = { id: 25, username: "newdude" };
      usersService.updateMyUser.mockResolvedValue(updated);

      const result = await controller.updateMyUser(body, dude);

      // updateMyUser, not updateUser: it is the one that checks currentPassword.
      expect(usersService.updateMyUser).toHaveBeenCalledWith(25, body);
      expect(usersService.updateUser).not.toHaveBeenCalled();
      expect(result).toBe(updated);
    });
  });

  describe("deleteMe", () => {
    it("deletes the user on the request, not one from the URL", async () => {
      // resolve as undefined because the return type is void
      usersService.deleteUser.mockResolvedValue(undefined);
      await controller.deleteMe(dude);

      expect(usersService.deleteUser).toHaveBeenCalledWith(dude.id);
    });
  });

  describe("deleteUser", () => {
    it("passes the id to the service and returns nothing", async () => {
      usersService.deleteUser.mockResolvedValue(undefined);

      const result = await controller.deleteUser({ id: 7 });

      expect(usersService.deleteUser).toHaveBeenCalledWith(7);
      expect(result).toBeUndefined();
    });
  });

  describe("restoreUser", () => {
    it("passes the id to the service and returns the restored user", async () => {
      const restored = { id: 7, username: "walter" };
      usersService.restoreUser.mockResolvedValue(restored);

      const result = await controller.restoreUser({ id: 7 });

      expect(usersService.restoreUser).toHaveBeenCalledWith(7);
      expect(result).toBe(restored);
    });
  });
});
