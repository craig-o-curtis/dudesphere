"use client";

import { use, useId, useState } from "react";
import type { ChangeEvent } from "react";

import { FormErrorsContext } from "../Form/Form";

type Messages = string | string[] | undefined;

interface UseFieldOptions<E extends HTMLElement> {
  name: string;
  /** True when a hint element is rendered, so `aria-describedby` names it. */
  hint: boolean;
  /** The field's own errors. They override the form's. */
  errors?: Messages;
  /** Forces the invalid state on or off. Overrides what the errors say. */
  invalid?: boolean;
  /** Ids of elements outside the field that also describe the control. */
  describedBy?: string;
  /** The caller's own change handler. It runs after the error clears. */
  onChange?: (event: ChangeEvent<E>) => void;
}

function toList(value: Messages): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

/**
 * The wiring every composed field shares. Ids come from `useId` during render,
 * so they are in the server HTML. Errors come from the field's own `errors`, or
 * from the `Form` by name. Typing in the field drops its server error until the
 * next set of errors arrives (A11Y-3). No effect is involved: the container
 * that was cleared (the field's `errors`, or the Form's errors object) is kept
 * in state, and errors show only while it differs from the current one. The
 * memory is dropped when there are no errors at all, so a plain string that
 * comes back after the errors went away shows again. A caller's own `errors`
 * value should keep its identity between renders (a literal array in JSX makes
 * a new one each render).
 */
export function useField<E extends HTMLElement = HTMLInputElement>({
  name,
  hint,
  errors,
  invalid,
  describedBy,
  onChange,
}: UseFieldOptions<E>) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const formErrors = use(FormErrorsContext);
  const [clearedFor, setClearedFor] = useState<object | string>();

  const current = errors ?? formErrors?.[name];
  // What arrives anew is the container: the field's own `errors`, or the
  // FormErrors object. A string has no identity, so the same message sent
  // again would look like the one already cleared.
  const container = errors ?? formErrors;
  if (container === undefined && clearedFor !== undefined) setClearedFor(undefined);
  const messages = current !== undefined && clearedFor === container ? [] : toList(current);
  const showError = messages.length > 0;
  const isInvalid = invalid ?? showError;

  const ids = [describedBy, hint ? hintId : undefined, showError ? errorId : undefined]
    .filter(Boolean)
    .join(" ");

  function handleChange(event: ChangeEvent<E>) {
    if (current !== undefined) setClearedFor(container);
    onChange?.(event);
  }

  return {
    hintId,
    errorId,
    messages,
    inputProps: {
      id,
      name,
      "aria-invalid": isInvalid ? (true as const) : undefined,
      "aria-describedby": ids || undefined,
      onChange: handleChange,
    },
  };
}
