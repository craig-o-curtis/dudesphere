import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { Label } from "./Label";

describe("Label", () => {
  it("names the control it points at", () => {
    render(
      <>
        <Label htmlFor="e">Email</Label>
        <input id="e" />
      </>,
    );
    expect(screen.getByRole("textbox", { name: "Email" })).toBeInTheDocument();
  });

  it("merges className, keeps its own class", () => {
    render(<Label className="extra">Email</Label>);
    const el = screen.getByText("Email");
    expect(el).toHaveClass("extra");
    expect(el.classList.length).toBeGreaterThan(1);
  });

  it("passes native props and ref to the label", () => {
    const ref = createRef<HTMLLabelElement>();
    render(
      <Label ref={ref} htmlFor="x" data-testid="l">
        Email
      </Label>,
    );
    const el = screen.getByTestId("l");
    expect(el).toHaveAttribute("for", "x");
    expect(ref.current).toBe(el);
  });
});
