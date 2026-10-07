import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { HashtagsController } from "./hashtags.controller.js";
import { HashtagsService } from "./hashtags.service.js";

describe("HashtagsController", () => {
  let controller: HashtagsController;

  const hashtagsService = {
    listAll: vi.fn(),
    getBySlug: vi.fn(),
    deleteBySlug: vi.fn(),
    restoreBySlug: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HashtagsController],
      providers: [{ provide: HashtagsService, useValue: hashtagsService }],
    }).compile();

    controller = module.get<HashtagsController>(HashtagsController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("getHashtags", () => {
    it("returns the full registry", async () => {
      const hashtags = [{ slug: "dude", display: "Dude", firstUsedAt: "2026-10-05T00:00:00.000Z" }];
      hashtagsService.listAll.mockResolvedValue(hashtags);

      expect(await controller.getHashtags()).toEqual(hashtags);
    });
  });

  describe("getHashtagBySlug", () => {
    it("returns the tag when registered", async () => {
      const hashtag = { slug: "dude", display: "Dude", firstUsedAt: "2026-10-05T00:00:00.000Z" };
      hashtagsService.getBySlug.mockResolvedValue(hashtag);

      expect(await controller.getHashtagBySlug("dude")).toEqual(hashtag);
    });

    it("throws NotFoundException when the tag isn't registered", async () => {
      hashtagsService.getBySlug.mockResolvedValue(null);

      await expect(controller.getHashtagBySlug("nope")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // No role assertion here. The admin-only rule is @Roles() metadata read by
  // RolesGuard, an APP_GUARD this testing module never registers, so a 403 is
  // unreachable from a unit spec. test/hashtags.e2e-spec.ts proves it over HTTP.
  describe("deleteHashtagBySlug", () => {
    it("hands the slug to the service", async () => {
      hashtagsService.deleteBySlug.mockResolvedValue(undefined);

      await controller.deleteHashtagBySlug("sunday");

      expect(hashtagsService.deleteBySlug).toHaveBeenCalledWith("sunday");
    });

    it("lets the service's NotFoundException through", async () => {
      hashtagsService.deleteBySlug.mockRejectedValue(new NotFoundException("Hashtag not found"));

      await expect(controller.deleteHashtagBySlug("nope")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // Admin only, like the delete, and for the same reason there is no role
  // assertion here: test/hashtags.e2e-spec.ts proves the 403 over HTTP.
  describe("restoreHashtagBySlug", () => {
    it("hands the slug to the service and returns the restored tag", async () => {
      const hashtag = {
        slug: "sunday",
        display: "Sunday",
        firstUsedAt: "2026-10-05T00:00:00.000Z",
      };
      hashtagsService.restoreBySlug.mockResolvedValue(hashtag);

      expect(await controller.restoreHashtagBySlug("sunday")).toEqual(hashtag);
      expect(hashtagsService.restoreBySlug).toHaveBeenCalledWith("sunday");
    });

    it("lets the service's NotFoundException through", async () => {
      hashtagsService.restoreBySlug.mockRejectedValue(
        new NotFoundException("Deleted hashtag not found"),
      );

      await expect(controller.restoreHashtagBySlug("nope")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
