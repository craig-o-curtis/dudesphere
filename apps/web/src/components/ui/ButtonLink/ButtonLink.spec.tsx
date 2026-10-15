import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { ButtonLink } from "./ButtonLink";

describe("ButtonLink", () => {
  it("renders a link with its name and href", () => {
    render(<ButtonLink href="/signup">Sign up</ButtonLink>);
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/signup");
  });

  it("keeps its own class and adds the one passed in", () => {
    render(
      <ButtonLink href="/login" className="extra">
        Sign in
      </ButtonLink>,
    );
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link).toHaveClass("extra");
    expect(link.classList.length).toBeGreaterThan(1);
  });

  it("defaults to the secondary variant", () => {
    render(<ButtonLink href="/x">Go</ButtonLink>);
    expect(screen.getByRole("link", { name: "Go" })).toHaveAttribute("data-variant", "secondary");
  });

  it.each(["primary", "secondary", "quiet"] as const)("shows the %s variant", (variant) => {
    render(
      <ButtonLink href="/x" variant={variant}>
        Go
      </ButtonLink>,
    );
    expect(screen.getByRole("link", { name: "Go" })).toHaveAttribute("data-variant", variant);
  });

  it("passes native props and ref to the anchor", () => {
    const ref = createRef<HTMLAnchorElement>();
    render(
      <ButtonLink ref={ref} href="/x" id="go" aria-describedby="hint">
        Go
      </ButtonLink>,
    );
    const link = screen.getByRole("link", { name: "Go" });
    expect(link).toHaveAttribute("id", "go");
    expect(link).toHaveAttribute("aria-describedby", "hint");
    expect(ref.current).toBe(link);
  });
});
