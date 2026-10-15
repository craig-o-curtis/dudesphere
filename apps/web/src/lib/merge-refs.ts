import type { Ref } from "react";

function assign<T>(ref: Ref<T> | undefined, node: T | null): void | (() => void) {
  if (typeof ref === "function") return ref(node) as void | (() => void);
  if (ref) ref.current = node;
}

/**
 * One callback ref that feeds several refs: object refs, callback refs, and
 * React 19 callback refs that return a cleanup function. On unmount it runs
 * each cleanup, or calls the ref with `null` when there is none.
 */
export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
  return function attach(node: T | null) {
    const cleanups = refs.map((ref) => assign(ref, node));
    return function detach() {
      refs.forEach((ref, index) => {
        const cleanup = cleanups[index];
        if (typeof cleanup === "function") cleanup();
        else assign(ref, null);
      });
    };
  };
}
