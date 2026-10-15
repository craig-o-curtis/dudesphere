import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { TextInput } from "./TextInput";

describe("TextInput", () => {
  it("renders a text box with its accessible name", () => {
    render(<TextInput aria-label="Username" name="username" />);
    const input = screen.getByRole("textbox", { name: "Username" });
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("name", "username");
  });

  it("merges className, keeps its own class", () => {
    render(<TextInput aria-label="A" className="extra" />);
    const el = screen.getByRole("textbox");
    expect(el).toHaveClass("extra");
    expect(el.classList.length).toBeGreaterThan(1);
  });

  it("passes native props and ref to the input", () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <TextInput
        ref={ref}
        aria-label="A"
        required
        minLength={3}
        maxLength={24}
        pattern="[^\s@]+"
        title="No spaces."
        autoComplete="username"
        defaultValue="walter"
        aria-describedby="h"
        data-testid="i"
      />,
    );
    const el = screen.getByTestId("i");
    expect(el).toBeRequired();
    expect(el).toHaveAttribute("minlength", "3");
    expect(el).toHaveAttribute("maxlength", "24");
    expect(el).toHaveAttribute("pattern", "[^\\s@]+");
    expect(el).toHaveAttribute("title", "No spaces.");
    expect(el).toHaveAttribute("autocomplete", "username");
    expect(el).toHaveAttribute("aria-describedby", "h");
    expect(el).toHaveValue("walter");
    expect(ref.current).toBe(el);
  });

  it("leaves the invalid look to aria-invalid", () => {
    render(<TextInput aria-label="A" aria-invalid />);
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
  });
});
