import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { PageShell } from "./PageShell";

describe("PageShell", () => {
  it("renders a section and never a main landmark", () => {
    const { container } = render(<PageShell.Root aria-label="Sign in">Inside</PageShell.Root>);
    expect(screen.getByRole("region", { name: "Sign in" }).tagName).toBe("SECTION");
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
    expect(container.querySelector("main")).toBeNull();
  });

  it("keeps its own class and adds the one passed in", () => {
    render(
      <PageShell.Root className="extra" data-testid="shell">
        x
      </PageShell.Root>,
    );
    const shell = screen.getByTestId("shell");
    expect(shell).toHaveClass("extra");
    expect(shell.classList.length).toBeGreaterThan(1);
  });

  it("shows width and align as data attributes, with defaults", () => {
    const { rerender } = render(<PageShell.Root data-testid="shell">x</PageShell.Root>);
    const shell = screen.getByTestId("shell");
    expect(shell).toHaveAttribute("data-width", "content");
    expect(shell).toHaveAttribute("data-align", "start");
    rerender(
      <PageShell.Root width="form" align="center" data-testid="shell">
        x
      </PageShell.Root>,
    );
    expect(shell).toHaveAttribute("data-width", "form");
    expect(shell).toHaveAttribute("data-align", "center");
  });

  it("shows gap and text as data attributes, with defaults", () => {
    const { rerender } = render(<PageShell.Root data-testid="shell">x</PageShell.Root>);
    const shell = screen.getByTestId("shell");
    expect(shell).toHaveAttribute("data-gap", "m");
    expect(shell).toHaveAttribute("data-text", "start");
    rerender(
      <PageShell.Root width="fit" gap="l" text="center" data-testid="shell">
        x
      </PageShell.Root>,
    );
    expect(shell).toHaveAttribute("data-width", "fit");
    expect(shell).toHaveAttribute("data-gap", "l");
    expect(shell).toHaveAttribute("data-text", "center");
  });

  it("passes native props and ref to the root, with no inline style", () => {
    const ref = createRef<HTMLElement>();
    render(
      <PageShell.Root ref={ref} id="p" data-testid="shell">
        x
      </PageShell.Root>,
    );
    const shell = screen.getByTestId("shell");
    expect(shell).toHaveAttribute("id", "p");
    expect(ref.current).toBe(shell);
    expect(shell).not.toHaveAttribute("style");
  });

  it("renders the header with its children, class, props and ref", () => {
    const ref = createRef<HTMLElement>();
    render(
      <PageShell.Root>
        <PageShell.Header ref={ref} className="extra" data-testid="head">
          <h1>Welcome</h1>
        </PageShell.Header>
      </PageShell.Root>,
    );
    const head = screen.getByTestId("head");
    expect(head).toHaveClass("extra");
    expect(head.classList.length).toBeGreaterThan(1);
    expect(ref.current).toBe(head);
    expect(screen.getByRole("heading", { name: "Welcome" })).toBeInTheDocument();
  });
});
