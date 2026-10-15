import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { Hint } from "./Hint";

describe("Hint", () => {
  it("renders its text with the id it is given", () => {
    render(<Hint id="h">We never share it.</Hint>);
    expect(screen.getByText("We never share it.")).toHaveAttribute("id", "h");
  });

  it("merges className, keeps its own class", () => {
    render(<Hint className="extra">Hi</Hint>);
    const el = screen.getByText("Hi");
    expect(el).toHaveClass("extra");
    expect(el.classList.length).toBeGreaterThan(1);
  });

  it("passes native props and ref to the paragraph", () => {
    const ref = createRef<HTMLParagraphElement>();
    render(
      <Hint ref={ref} data-testid="h">
        Hi
      </Hint>,
    );
    expect(ref.current).toBe(screen.getByTestId("h"));
  });
});
