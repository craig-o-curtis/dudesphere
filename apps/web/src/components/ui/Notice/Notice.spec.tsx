import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { Notice } from "./Notice";

describe("Notice", () => {
  it("is a status region with its text", () => {
    render(<Notice>You are signed out.</Notice>);
    expect(screen.getByRole("status")).toHaveTextContent("You are signed out.");
  });

  it("is still in the page when empty, so the line is reserved", () => {
    render(<Notice />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("keeps its own class and adds the one passed in", () => {
    render(<Notice className="extra">Hi</Notice>);
    const notice = screen.getByRole("status");
    expect(notice).toHaveClass("extra");
    expect(notice.classList.length).toBeGreaterThan(1);
  });

  it("shows the tone as a data attribute, with a default", () => {
    const { rerender } = render(<Notice>Hi</Notice>);
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", "default");
    rerender(<Notice tone="danger">Hi</Notice>);
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", "danger");
  });

  it("shows a size as a data attribute only when one is set", () => {
    const { rerender } = render(<Notice>Hi</Notice>);
    expect(screen.getByRole("status")).not.toHaveAttribute("data-size");
    rerender(<Notice size="xs">Hi</Notice>);
    expect(screen.getByRole("status")).toHaveAttribute("data-size", "xs");
  });

  it("passes native props and ref to the root, with no inline style", () => {
    const ref = createRef<HTMLOutputElement>();
    render(
      <Notice ref={ref} id="n">
        Hi
      </Notice>,
    );
    const notice = screen.getByRole("status");
    expect(notice).toHaveAttribute("id", "n");
    expect(ref.current).toBe(notice);
    expect(notice).not.toHaveAttribute("style");
  });
});
