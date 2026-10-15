import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { Stack } from "./Stack";

describe("Stack", () => {
  it("renders its children in a div by default", () => {
    render(<Stack data-testid="stack">Inside</Stack>);
    const stack = screen.getByTestId("stack");
    expect(stack.tagName).toBe("DIV");
    expect(stack).toHaveTextContent("Inside");
  });

  it("renders the element named by as, keeping its role", () => {
    render(
      <Stack as="ul" aria-label="Lanes">
        <li>One</li>
      </Stack>,
    );
    expect(screen.getByRole("list", { name: "Lanes" })).toBeInTheDocument();
  });

  it("keeps its own class and adds the one passed in", () => {
    render(
      <Stack className="extra" data-testid="stack">
        x
      </Stack>,
    );
    const stack = screen.getByTestId("stack");
    expect(stack).toHaveClass("extra");
    expect(stack.classList.length).toBeGreaterThan(1);
  });

  it("shows the gap as a data attribute, with a default", () => {
    const { rerender } = render(<Stack data-testid="stack">x</Stack>);
    expect(screen.getByTestId("stack")).toHaveAttribute("data-gap", "4");
    rerender(
      <Stack gap={6} data-testid="stack">
        x
      </Stack>,
    );
    expect(screen.getByTestId("stack")).toHaveAttribute("data-gap", "6");
  });

  it("passes native props and ref to the root, with no inline style", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <Stack ref={ref} id="s" data-testid="stack">
        x
      </Stack>,
    );
    const stack = screen.getByTestId("stack");
    expect(stack).toHaveAttribute("id", "s");
    expect(ref.current).toBe(stack);
    expect(stack).not.toHaveAttribute("style");
  });
});
