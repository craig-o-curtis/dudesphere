import { getModelToken } from "@nestjs/mongoose";
import { Test, TestingModule } from "@nestjs/testing";

import { Abiding } from "../../abidings/abiding.schema.js";
import { HashtagsService } from "../../hashtags/hashtags.service.js";
import { HashtagBackfillService } from "./hashtag-backfill.seed.js";

describe("HashtagBackfillService", () => {
  let service: HashtagBackfillService;

  // The service reads with find().cursor() and iterates it with `for await`,
  // so the mock cursor has to be async-iterable.
  function cursorOf(docs: { _id: string; message: string }[]) {
    return {
      async *[Symbol.asyncIterator]() {
        for (const doc of docs) {
          yield doc;
        }
      },
    };
  }

  const abidingModel = {
    find: vi.fn(),
    updateOne: vi.fn(),
  };

  const hashtagsService = {
    registerTags: vi.fn(),
  };

  // Loads the collection the run will walk over.
  function givenAbidings(docs: { _id: string; message: string }[]) {
    abidingModel.find.mockReturnValue({ cursor: () => cursorOf(docs) });
  }

  beforeEach(async () => {
    vi.resetAllMocks();
    abidingModel.updateOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(undefined) });
    givenAbidings([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HashtagBackfillService,
        { provide: getModelToken(Abiding.name), useValue: abidingModel },
        { provide: HashtagsService, useValue: hashtagsService },
      ],
    }).compile();

    service = module.get<HashtagBackfillService>(HashtagBackfillService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("projects only the message, since that is all the derivation needs", async () => {
    await service.backfill();

    expect(abidingModel.find).toHaveBeenCalledWith({}, { message: 1 });
  });

  it("derives hashtags onto each abiding", async () => {
    givenAbidings([
      { _id: "a1", message: "Taking it easy #Sunday" },
      { _id: "a2", message: "The #Dude abides" },
    ]);

    await service.backfill();

    expect(abidingModel.updateOne).toHaveBeenCalledWith(
      { _id: "a1" },
      { $set: { hashtags: ["sunday"] } },
    );
    expect(abidingModel.updateOne).toHaveBeenCalledWith(
      { _id: "a2" },
      { $set: { hashtags: ["dude"] } },
    );
  });

  it("writes an empty array for an abiding with no tags", async () => {
    givenAbidings([{ _id: "a1", message: "no tags here" }]);

    await service.backfill();

    expect(abidingModel.updateOne).toHaveBeenCalledWith({ _id: "a1" }, { $set: { hashtags: [] } });
  });

  // A tag used by many abidings must not be upserted once per abiding.
  it("registers every tag in one call, deduplicated across abidings", async () => {
    givenAbidings([
      { _id: "a1", message: "#Sunday #Dude" },
      { _id: "a2", message: "#sunday again" },
      { _id: "a3", message: "#Walter" },
    ]);

    await service.backfill();

    expect(hashtagsService.registerTags).toHaveBeenCalledTimes(1);
    expect(hashtagsService.registerTags).toHaveBeenCalledWith(
      new Map([
        ["sunday", "Sunday"],
        ["dude", "Dude"],
        ["walter", "Walter"],
      ]),
    );
  });

  // Matches registerTags, so a re-run can't change a tag's display casing.
  it("keeps the first casing seen when abidings disagree", async () => {
    givenAbidings([
      { _id: "a1", message: "#Dude" },
      { _id: "a2", message: "#DUDE" },
    ]);

    await service.backfill();

    expect(hashtagsService.registerTags).toHaveBeenCalledWith(new Map([["dude", "Dude"]]));
  });

  it("reports how many abidings and tags it touched", async () => {
    givenAbidings([
      { _id: "a1", message: "#Sunday #Dude" },
      { _id: "a2", message: "no tags" },
    ]);

    expect(await service.backfill()).toEqual({ abidings: 2, tags: 2 });
  });

  it("still registers nothing and reports zero on an empty collection", async () => {
    const result = await service.backfill();

    expect(abidingModel.updateOne).not.toHaveBeenCalled();
    expect(hashtagsService.registerTags).toHaveBeenCalledWith(new Map());
    expect(result).toEqual({ abidings: 0, tags: 0 });
  });

  // The whole point of the script: running it twice must not change anything
  // the first run already settled.
  it("produces the same writes when run twice", async () => {
    givenAbidings([{ _id: "a1", message: "#Sunday" }]);

    await service.backfill();
    const firstUpdate = abidingModel.updateOne.mock.calls[0];
    const firstRegister = hashtagsService.registerTags.mock.calls[0];

    vi.clearAllMocks();
    abidingModel.updateOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(undefined) });
    givenAbidings([{ _id: "a1", message: "#Sunday" }]);

    await service.backfill();

    expect(abidingModel.updateOne.mock.calls[0]).toEqual(firstUpdate);
    expect(hashtagsService.registerTags.mock.calls[0]).toEqual(firstRegister);
  });
});
