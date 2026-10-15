import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { Text } from "./Text";

describe("Text", () => {
  it("renders a paragraph by default", () => {
    render(<Text>Hello there</Text>);
    expect(screen.getByText("Hello there").tagName).toBe("P");
  });

  it.each(["p", "span", "div"] as const)("renders a %s when asked", (as) => {
    render(<Text as={as}>Words</Text>);
    expect(screen.getByText("Words").tagName).toBe(as.toUpperCase());
  });

  it("keeps its own class and adds the one passed in", () => {
    render(<Text className="extra">Words</Text>);
    const el = screen.getByText("Words");
    expect(el).toHaveClass("extra");
    expect(el.classList.length).toBeGreaterThan(1);
  });

  it("shows tone and size as data attributes", () => {
    render(
      <Text tone="danger" size="lg">
        Words
      </Text>,
    );
    const el = screen.getByText("Words");
    expect(el).toHaveAttribute("data-tone", "danger");
    expect(el).toHaveAttribute("data-size", "lg");
  });

  it("accepts the xl size", () => {
    render(<Text size="xl">Big</Text>);
    expect(screen.getByText("Big")).toHaveAttribute("data-size", "xl");
  });

  it("defaults to the default tone and base size", () => {
    render(<Text>Words</Text>);
    const el = screen.getByText("Words");
    expect(el).toHaveAttribute("data-tone", "default");
    expect(el).toHaveAttribute("data-size", "base");
  });

  it("passes native props and ref to the root", () => {
    const ref = createRef<HTMLParagraphElement>();
    render(
      <Text ref={ref} id="hint" aria-live="polite">
        Words
      </Text>,
    );
    const el = screen.getByText("Words");
    expect(el).toHaveAttribute("id", "hint");
    expect(el).toHaveAttribute("aria-live", "polite");
    expect(ref.current).toBe(el);
  });
});
