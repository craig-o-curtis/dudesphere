"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { Notice } from "@/components/ui/Notice/Notice";

/**
 * A success notice that takes focus when it appears. A redirect leaves focus
 * on the page body, and a live region that arrives already filled is often
 * not announced. Focusing it makes a screen reader read it.
 *
 * It takes focus only when nothing else has it. On a slow hard load the
 * member may already be typing in the sign-in form, and must not be pulled out.
 */
export function FocusedNotice({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLOutputElement>(null);

  useEffect(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) ref.current?.focus();
  }, []);

  return (
    <Notice ref={ref} tone="success" tabIndex={-1}>
      {children}
    </Notice>
  );
}
