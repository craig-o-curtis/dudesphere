import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { CheckboxInput } from "./CheckboxInput";

describe("CheckboxInput", () => {
  it("renders a checkbox with its accessible name", () => {
    render(<CheckboxInput aria-label="Remember me" name="remember" />);
    expect(screen.getByRole("checkbox", { name: "Remember me" })).not.toBeChecked();
  });

  it("merges className, keeps its own class", () => {
    render(<CheckboxInput aria-label="A" className="extra" />);
    const el = screen.getByRole("checkbox");
    expect(el).toHaveClass("extra");
    expect(el.classList.length).toBeGreaterThan(1);
  });

  it("passes native props and ref", () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <CheckboxInput
        ref={ref}
        aria-label="A"
        defaultChecked
        value="yes"
        aria-invalid
        data-testid="c"
      />,
    );
    const el = screen.getByTestId("c");
    expect(el).toBeChecked();
    expect(el).toHaveAttribute("value", "yes");
    expect(el).toHaveAttribute("aria-invalid", "true");
    expect(ref.current).toBe(el);
  });
});
