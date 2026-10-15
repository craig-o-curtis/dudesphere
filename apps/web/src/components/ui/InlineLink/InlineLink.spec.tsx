import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { InlineLink } from "./InlineLink";

describe("InlineLink", () => {
  it("is a link with its name and destination", () => {
    render(<InlineLink href="/login">Sign in</InlineLink>);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("keeps its own class and adds the one passed in", () => {
    render(
      <InlineLink href="/login" className="extra">
        Sign in
      </InlineLink>,
    );
    const el = screen.getByRole("link", { name: "Sign in" });
    expect(el).toHaveClass("extra");
    expect(el.classList.length).toBeGreaterThan(1);
  });

  it("shows its tone as a data attribute, defaulting to inherit", () => {
    const { rerender } = render(<InlineLink href="/login">Sign in</InlineLink>);
    const el = screen.getByRole("link", { name: "Sign in" });
    expect(el).toHaveAttribute("data-tone", "inherit");
    rerender(
      <InlineLink href="/login" tone="accent">
        Sign in
      </InlineLink>,
    );
    expect(el).toHaveAttribute("data-tone", "accent");
  });

  it("passes native props and ref to the anchor", () => {
    const ref = createRef<HTMLAnchorElement>();
    render(
      <InlineLink href="/login" ref={ref} id="to-login" aria-describedby="hint">
        Sign in
      </InlineLink>,
    );
    const el = screen.getByRole("link", { name: "Sign in" });
    expect(el).toHaveAttribute("id", "to-login");
    expect(el).toHaveAttribute("aria-describedby", "hint");
    expect(ref.current).toBe(el);
  });
});
