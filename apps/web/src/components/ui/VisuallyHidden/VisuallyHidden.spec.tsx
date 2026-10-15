import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { VisuallyHidden } from "./VisuallyHidden";

describe("VisuallyHidden", () => {
  it("renders a span that stays in the accessibility tree", () => {
    render(<VisuallyHidden>Theme</VisuallyHidden>);
    const el = screen.getByText("Theme");
    expect(el.tagName).toBe("SPAN");
    expect(el).toBeVisible();
  });

  it("keeps its own class and adds the one passed in", () => {
    render(<VisuallyHidden className="extra">Theme</VisuallyHidden>);
    const el = screen.getByText("Theme");
    expect(el).toHaveClass("extra");
    expect(el.classList.length).toBeGreaterThan(1);
  });

  it("passes native props and ref to the span", () => {
    const ref = createRef<HTMLSpanElement>();
    render(
      <VisuallyHidden ref={ref} id="label">
        Theme
      </VisuallyHidden>,
    );
    const el = screen.getByText("Theme");
    expect(el).toHaveAttribute("id", "label");
    expect(ref.current).toBe(el);
  });
});
