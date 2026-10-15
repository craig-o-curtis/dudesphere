"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { ComponentPropsWithRef } from "react";

import { cx } from "@/lib/cx";
import { mergeRefs } from "@/lib/merge-refs";

import { TextInput } from "../TextInput/TextInput";
import { VisuallyHidden } from "../VisuallyHidden/VisuallyHidden";

import styles from "./PasswordInput.module.css";

// The part owns `type` and the three keyboard-helper attributes, so callers can't set them.
type PasswordInputProps = Omit<
  ComponentPropsWithRef<typeof TextInput>,
  "type" | "spellCheck" | "autoCorrect" | "autoCapitalize"
>;

function subscribe() {
  return () => {};
}

// False on the server and while hydrating, true once the page is interactive.
function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={styles.icon}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={styles.icon}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

/**
 * A password input with a button that shows or hides the text. The button is
 * in the server HTML but inert and invisible until the page hydrates, so the
 * layout doesn't shift and nothing is clickable that can't work. The input
 * keeps its `name`, `autoComplete` and native rules in both states.
 */
export function PasswordInput({ id, className, ref, ...rest }: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  const ready = useHydrated();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Hide the password again when the form submits (QA-13). The browser reads
  // the input's value when it builds the submission, which happens after the
  // submit event, so the value is still posted. This effect syncs with the
  // DOM form, an external system.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    function hide() {
      setVisible(false);
    }
    form.addEventListener("submit", hide);
    return () => form.removeEventListener("submit", hide);
  }, []);

  return (
    <div className={styles.root}>
      <TextInput
        ref={mergeRefs(inputRef, ref)}
        id={inputId}
        className={cx(styles.input, className)}
        {...rest}
        // The part owns these, after `rest`, so no caller can turn them back on
        // for a password (SEC-2).
        type={visible ? "text" : "password"}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
      />
      <button
        type="button"
        className={styles.toggle}
        aria-pressed={visible}
        aria-controls={inputId}
        data-ready={ready}
        inert={!ready}
        onClick={() => setVisible(!visible)}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
        <VisuallyHidden>Show password</VisuallyHidden>
      </button>
    </div>
  );
}
