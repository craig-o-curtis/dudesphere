import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { mergeRefs } from "./merge-refs";

describe("mergeRefs", () => {
  it("sets object refs and clears them on detach", () => {
    const a = createRef<HTMLDivElement>();
    const b = createRef<HTMLDivElement>();
    const node = document.createElement("div");
    const detach = mergeRefs(a, b)(node);
    expect(a.current).toBe(node);
    expect(b.current).toBe(node);
    detach();
    expect(a.current).toBeNull();
    expect(b.current).toBeNull();
  });

  it("calls a callback ref with the node, then with null on detach", () => {
    const ref = vi.fn();
    const node = document.createElement("div");
    const detach = mergeRefs(ref)(node);
    expect(ref).toHaveBeenLastCalledWith(node);
    detach();
    expect(ref).toHaveBeenLastCalledWith(null);
  });

  it("runs a React 19 cleanup instead of calling the ref with null", () => {
    const cleanup = vi.fn();
    const ref = vi.fn(() => cleanup);
    const node = document.createElement("div");
    const detach = mergeRefs(ref)(node);
    detach();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(ref).toHaveBeenCalledTimes(1);
  });

  it("skips undefined refs", () => {
    const node = document.createElement("div");
    expect(() => mergeRefs(undefined)(node)()).not.toThrow();
  });
});
