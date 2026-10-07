import { BadRequestException } from "@nestjs/common";
import { ParseObjectIdPipe } from "@nestjs/mongoose";
import { Types } from "mongoose";

// Pins the behaviour AbidingsController relies on from @nestjs/mongoose's
// ParseObjectIdPipe. Normally a dependency is not worth unit testing, but this
// one has already moved: older Mongoose accepted any 12-character string as a
// valid ObjectId, and 9.10.2 does not. Our routes are only safe because of the
// stricter rule, so if a future version loosens it again this file fails rather
// than the app quietly accepting junk ids.
//
// The pipe returns a Types.ObjectId, which is why the route params are typed
// that way and the service is handed id.toString().
describe("ParseObjectIdPipe contract", () => {
  const pipe = new ParseObjectIdPipe();

  it("accepts a 24-character hex id and returns an ObjectId", () => {
    const id = "6ac543e3d91134719299fe49";

    const result = pipe.transform(id);

    expect(result).toBeInstanceOf(Types.ObjectId);
    expect(result.toString()).toBe(id);
  });

  it("accepts upper-case hex", () => {
    expect(pipe.transform("6AC543E3D91134719299FE49").toString()).toBe("6ac543e3d91134719299fe49");
  });

  // The route-ordering comments in this controller exist so "me" never reaches
  // @Get(":id"). If that ordering ever broke, this is the second line of
  // defence: a clean 400 instead of a confusing 500.
  it("rejects the literal 'me'", () => {
    expect(() => pipe.transform("me")).toThrow(BadRequestException);
  });

  // The one that matters most. Mongoose used to let any 12-character string
  // through here, which would have become a bogus ObjectId built from those
  // bytes rather than a 400.
  it.each(["hello world!", "abcdefghijkl", "123456789012"])(
    "rejects the 12-character string %j that older Mongoose accepted",
    (value) => {
      expect(() => pipe.transform(value)).toThrow(BadRequestException);
    },
  );

  it.each(["not-an-id", "", "6ac543e3d91134719299fe4", "6ac543e3d91134719299fe499", "0"])(
    "rejects %j",
    (value) => {
      expect(() => pipe.transform(value)).toThrow(BadRequestException);
    },
  );

  // Whitespace is not trimmed, so a URL with a stray space is a 400 rather
  // than a lookup for the trimmed id.
  it("rejects an otherwise valid id with surrounding whitespace", () => {
    expect(() => pipe.transform(" 6ac543e3d91134719299fe49")).toThrow(BadRequestException);
  });
});
