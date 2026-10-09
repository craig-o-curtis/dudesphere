import { REQUEST_ID_HEADER, requestId } from "./request-id.middleware.js";

function mockRequest(incoming?: string) {
  const req = { headers: {} as Record<string, string>, header: () => incoming };
  const res = { setHeader: vi.fn() };
  const next = vi.fn();
  requestId(req as never, res as never, next);
  return { req, res, next };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("requestId middleware", () => {
  it("generates a uuid when the caller sends none", () => {
    const { req, res, next } = mockRequest();

    expect(req.headers[REQUEST_ID_HEADER]).toMatch(UUID);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.headers[REQUEST_ID_HEADER]);
    expect(next).toHaveBeenCalledOnce();
  });

  it("keeps a safe id the caller sent", () => {
    const { req } = mockRequest("trace-42");

    expect(req.headers[REQUEST_ID_HEADER]).toBe("trace-42");
  });

  it("keeps an id of exactly 64 characters", () => {
    const { req } = mockRequest("a".repeat(64));

    expect(req.headers[REQUEST_ID_HEADER]).toBe("a".repeat(64));
  });

  // A fresh uuid, not just "something else": a cut-down copy of the input or
  // a missing id would also differ from what was sent.
  it.each([
    ["one character too long", "a".repeat(65)],
    ["odd characters", "<script>"],
    ["a space", "trace 42"],
  ])("replaces an id with %s by a fresh uuid", (_why, incoming) => {
    const { req, res } = mockRequest(incoming);

    expect(req.headers[REQUEST_ID_HEADER]).toMatch(UUID);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.headers[REQUEST_ID_HEADER]);
  });
});
