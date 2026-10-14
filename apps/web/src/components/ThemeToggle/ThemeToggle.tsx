"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

import { setTheme } from "@/lib/actions/theme";
import { themeFromCookieHeader, type Theme } from "@/lib/theme";

import styles from "./ThemeToggle.module.css";

type ThemeToggleProps = {
  /** The saved theme, or `null` when the OS decides. */
  current: Theme | null;
  /**
   * True for the Suspense fallback. The buttons look the same but are
   * `aria-disabled` and do nothing, because the saved theme is not known yet.
   */
  pending?: boolean;
};

const CHOICES: { theme: Theme; label: string }[] = [
  { theme: "light", label: "Light" },
  { theme: "dark", label: "Dark" },
];

function subscribe() {
  return () => {};
}

/** False in server HTML and during hydration, true once running in the browser. */
function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

function applyToPage(theme: Theme | null) {
  if (theme) {
    document.documentElement.setAttribute("data-theme", theme);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

/**
 * Two toggle buttons for the colour theme. There is no System button:
 * pressing the pressed button hands control back to the OS.
 *
 * These are plain `type="button"` buttons, not a form. A press before the
 * page has hydrated does nothing. After that, a press updates the screen at
 * once, calls the Server Action, and then adopts the theme the server says is
 * saved (`null` when the cookie is gone). The server decides what a press
 * means, so the screen ends up matching the cookie. A press sends what the
 * screen showed at press time: the button's own theme if it was not pressed,
 * `system` if it was. If the call fails, the screen shows the theme in the
 * cookie (the call can fail after the server set the cookie, so the cookie is
 * the truth). A status line says the save failed only when that cookie does
 * not match what the press asked for. The next press clears it.
 *
 * A tab that did not press last catches up with the cookie when it becomes
 * visible or the window gets focus, unless a press is in flight.
 *
 * The fallback root is `inert`: focus can never land on a placeholder button,
 * so nothing is lost when the real toggle replaces it. `aria-disabled` stays
 * on the buttons too, as a second guard (the handler also ignores presses).
 *
 * Until the page has hydrated the buttons are `aria-disabled` and do nothing,
 * so the served HTML does not look live.
 *
 * Several presses can be in flight. The last press wins: a response that is
 * not from the newest press is ignored.
 */
export function ThemeToggle({ current, pending = false }: ThemeToggleProps) {
  // Plain state, not useOptimistic: the call is a bare Server Action, so there
  // is no client transition to tie an optimistic value to.
  const [shown, setShown] = useState<Theme | null>(current);
  const [seenCurrent, setSeenCurrent] = useState<Theme | null>(current);
  // When the server sends a new `current`, adopt it (adjusting state during render).
  if (current !== seenCurrent) {
    setSeenCurrent(current);
    setShown(current);
  }
  const newestPress = useRef(0);
  const inFlight = useRef(0);
  const [failed, setFailed] = useState(false);
  const hydrated = useHydrated();
  const disabled = pending || !hydrated;
  const hintId = useId();

  // Strict Mode remounts effects in dev. Put a chosen theme back on <html>.
  // It never removes the attribute here: the fallback renders with null while
  // the saved theme is still loading.
  useLayoutEffect(() => {
    if (shown) {
      document.documentElement.setAttribute("data-theme", shown);
    }
  }, [shown]);

  // Catch up with the cookie when this tab comes back to the front.
  // The catch-up runs on window focus, so a click straight into a stale window
  // may act on the caught-up state rather than the one the member saw. This is
  // accepted: the screen shows the saved theme before the click lands, and the
  // result always matches the cookie.
  useEffect(() => {
    if (disabled) {
      return;
    }
    function refresh() {
      if (document.visibilityState === "hidden" || inFlight.current > 0) {
        return;
      }
      const fromCookie = themeFromCookieHeader(document.cookie);
      if (fromCookie !== shown) {
        applyToPage(fromCookie);
        setShown(fromCookie);
      }
    }
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [disabled, shown]);

  async function choose(theme: Theme) {
    if (disabled) {
      return;
    }
    const press = ++newestPress.current;
    setFailed(false);
    const guess = shown === theme ? null : theme;
    applyToPage(guess);
    setShown(guess);

    let saved: Theme | null;
    inFlight.current += 1;
    try {
      saved = await setTheme(shown === theme ? "system" : theme);
    } catch {
      // The call failed, but the server may still have changed the cookie
      // (the connection can break after the headers). Show what the cookie
      // holds, unless a newer press has taken over. Say so only when the
      // cookie is not what this press asked for.
      if (press === newestPress.current) {
        const fromCookie = themeFromCookieHeader(document.cookie);
        applyToPage(fromCookie);
        setShown(fromCookie);
        setFailed(fromCookie !== guess);
      }
      return;
    } finally {
      inFlight.current -= 1;
    }
    if (press !== newestPress.current) {
      return;
    }
    applyToPage(saved);
    setShown(saved);
  }

  return (
    <div className={styles.toggle} data-theme-toggle inert={pending}>
      <fieldset className={styles.group}>
        <legend className={styles.legend}>Theme</legend>
        {CHOICES.map(({ theme, label }) => {
          const isPressed = shown === theme;
          return (
            <button
              key={theme}
              type="button"
              aria-pressed={isPressed}
              aria-disabled={disabled ? true : undefined}
              aria-describedby={isPressed ? hintId : undefined}
              className={styles.button}
              onClick={() => void choose(theme)}
            >
              {label}
            </button>
          );
        })}
      </fieldset>
      <span id={hintId} className={styles.hint}>
        Press the selected button again to use your device setting.
      </span>
      <output className={styles.status}>
        {failed ? "Could not save your theme. Try again." : ""}
      </output>
    </div>
  );
}
