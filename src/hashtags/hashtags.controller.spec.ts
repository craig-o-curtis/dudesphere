import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { HashtagsController } from "./hashtags.controller.js";
import { HashtagsService } from "./hashtags.service.js";

describe("HashtagsController", () => {
  let controller: HashtagsController;

  const hashtagsService = {
    listAll: vi.fn(),
    getBySlug: vi.fn(),
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
});
