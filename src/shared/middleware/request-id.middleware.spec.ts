import { REQUEST_ID_HEADER, requestId } from "./request-id.middleware.js";

function mockRequest(incoming?: string) {
  const req = { headers: {} as Record<string, string>, header: () => incoming };
  const res = { setHeader: vi.fn() };
  const next = vi.fn();
  requestId(req as never, res as never, next);
  return { req, res, next };
}

describe("requestId middleware", () => {
  it("generates a uuid when the caller sends none", () => {
    const { req, res, next } = mockRequest();

    expect(req.headers[REQUEST_ID_HEADER]).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.headers[REQUEST_ID_HEADER]);
    expect(next).toHaveBeenCalledOnce();
  });

  it("keeps a safe id the caller sent", () => {
    const { req } = mockRequest("trace-42");

    expect(req.headers[REQUEST_ID_HEADER]).toBe("trace-42");
  });

  it("replaces an id that is too long or has odd characters", () => {
    expect(mockRequest("a".repeat(65)).req.headers[REQUEST_ID_HEADER]).not.toBe("a".repeat(65));
    expect(mockRequest("<script>").req.headers[REQUEST_ID_HEADER]).not.toBe("<script>");
  });
});
