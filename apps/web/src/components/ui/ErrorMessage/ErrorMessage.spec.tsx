import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { ErrorMessage } from "./ErrorMessage";

describe("ErrorMessage", () => {
  it("shows a string", () => {
    render(<ErrorMessage id="e" messages="Too short." />);
    expect(screen.getByText("Too short.")).toHaveAttribute("id", "e");
  });

  it("joins a list with a space", () => {
    render(<ErrorMessage messages={["Too short.", "Needs a digit."]} />);
    expect(screen.getByText("Too short. Needs a digit.")).toBeInTheDocument();
  });

  it("is not an alert", () => {
    render(<ErrorMessage messages="Bad." />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Bad.")).not.toHaveAttribute("role");
  });

  it("renders nothing with no messages", () => {
    const { container } = render(
      <>
        <ErrorMessage />
        <ErrorMessage messages={[]} />
        <ErrorMessage messages="" />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders text only, never HTML", () => {
    render(<ErrorMessage messages="<b>x</b>" />);
    expect(screen.getByText("<b>x</b>")).toBeInTheDocument();
  });

  it("merges className and passes props and ref", () => {
    const ref = createRef<HTMLParagraphElement>();
    render(<ErrorMessage ref={ref} className="extra" data-testid="e" messages="Bad." />);
    const el = screen.getByTestId("e");
    expect(el).toHaveClass("extra");
    expect(el.classList.length).toBeGreaterThan(1);
    expect(ref.current).toBe(el);
  });
});
