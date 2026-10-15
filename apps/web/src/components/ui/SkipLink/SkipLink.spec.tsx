import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { SkipLink } from "./SkipLink";

describe("SkipLink", () => {
  it("is the link with its name, and href reaches the root", () => {
    render(<SkipLink href="#main">Skip to content</SkipLink>);
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#main");
  });

  it("keeps its own class and adds the one passed in", () => {
    render(
      <SkipLink href="#main" className="extra">
        Skip
      </SkipLink>,
    );
    const el = screen.getByRole("link", { name: "Skip" });
    expect(el).toHaveClass("extra");
    expect(el.classList.length).toBeGreaterThan(1);
  });

  it("passes native props and ref to the anchor", () => {
    const ref = createRef<HTMLAnchorElement>();
    render(
      <SkipLink href="#main" ref={ref} id="skip" data-testid="skip">
        Skip
      </SkipLink>,
    );
    const el = screen.getByRole("link", { name: "Skip" });
    expect(el).toHaveAttribute("id", "skip");
    expect(el).toHaveAttribute("data-testid", "skip");
    expect(ref.current).toBe(el);
  });
});
