import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { Heading } from "./Heading";

describe("Heading", () => {
  it.each([1, 2, 3, 4] as const)("level %i picks the matching heading element", (level) => {
    render(<Heading level={level}>Title</Heading>);
    expect(screen.getByRole("heading", { name: "Title", level })).toBeInTheDocument();
  });

  it("keeps size separate from level", () => {
    render(
      <Heading level={2} size="3xl">
        Title
      </Heading>,
    );
    const el = screen.getByRole("heading", { name: "Title", level: 2 });
    expect(el).toHaveAttribute("data-size", "3xl");
    expect(el).not.toHaveAttribute("data-level");
  });

  it("has a default size", () => {
    render(<Heading level={1}>Title</Heading>);
    expect(screen.getByRole("heading", { name: "Title" })).toHaveAttribute("data-size", "xl");
  });

  it("keeps its own class and adds the one passed in", () => {
    render(
      <Heading level={1} className="extra">
        Title
      </Heading>,
    );
    const el = screen.getByRole("heading", { name: "Title" });
    expect(el).toHaveClass("extra");
    expect(el.classList.length).toBeGreaterThan(1);
  });

  it("passes native props and ref to the root", () => {
    const ref = createRef<HTMLHeadingElement>();
    render(
      <Heading level={1} ref={ref} id="page-title" tabIndex={-1}>
        Title
      </Heading>,
    );
    const el = screen.getByRole("heading", { name: "Title" });
    expect(el).toHaveAttribute("id", "page-title");
    expect(el).toHaveAttribute("tabindex", "-1");
    expect(ref.current).toBe(el);
  });
});
