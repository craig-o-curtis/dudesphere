import { useEffect, useRef } from "react";

/**
 * After a failed submit that returns field errors, moves focus to the first
 * input marked `aria-invalid="true"` in page order. Focusing the input makes a
 * screen reader read its label and its linked error. It does nothing on the
 * first render, or when the state has no field errors (a `role="alert"` form
 * error speaks for itself).
 */
export function useFocusFirstInvalid(state: unknown) {
  const formRef = useRef<HTMLFormElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);

  return formRef;
}
