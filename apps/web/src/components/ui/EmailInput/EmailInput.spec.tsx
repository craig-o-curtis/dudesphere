import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { EmailInput } from "./EmailInput";

describe("EmailInput", () => {
  it("renders an email box with its accessible name", () => {
    render(<EmailInput aria-label="Email" name="email" />);
    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveAttribute("name", "email");
  });

  it("merges className, keeps its own class", () => {
    render(<EmailInput aria-label="A" className="extra" />);
    const el = screen.getByRole("textbox");
    expect(el).toHaveClass("extra");
    expect(el.classList.length).toBeGreaterThan(1);
  });

  it("passes native props and ref to the input", () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <EmailInput
        ref={ref}
        aria-label="A"
        required
        pattern=".+@.+"
        autoComplete="email"
        aria-invalid
        data-testid="i"
      />,
    );
    const el = screen.getByTestId("i");
    expect(el).toBeRequired();
    expect(el).toHaveAttribute("pattern", ".+@.+");
    expect(el).toHaveAttribute("autocomplete", "email");
    expect(el).toHaveAttribute("aria-invalid", "true");
    expect(ref.current).toBe(el);
  });
});
