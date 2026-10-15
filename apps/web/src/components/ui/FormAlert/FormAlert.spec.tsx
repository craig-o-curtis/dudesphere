import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { FormAlert } from "./FormAlert";

describe("FormAlert", () => {
  it("renders an alert holding its message", () => {
    render(<FormAlert>That email or password doesn't match.</FormAlert>);
    expect(screen.getByRole("alert")).toHaveTextContent("That email or password doesn't match.");
  });

  it("renders nothing with no children", () => {
    const { container } = render(<FormAlert />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for empty values", () => {
    const { container } = render(
      <>
        <FormAlert>{null}</FormAlert>
        <FormAlert>{false}</FormAlert>
        <FormAlert>{""}</FormAlert>
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps its own class and adds the one passed in", () => {
    render(<FormAlert className="extra">Oops</FormAlert>);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("extra");
    expect(alert.classList.length).toBeGreaterThan(1);
  });

  it("passes native props and ref to the root", () => {
    const ref = createRef<HTMLParagraphElement>();
    render(
      <FormAlert ref={ref} id="form-alert" data-testid="alert">
        Oops
      </FormAlert>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("id", "form-alert");
    expect(alert).toHaveAttribute("data-testid", "alert");
    expect(ref.current).toBe(alert);
  });

  it("can hold a link next to the message", () => {
    render(
      <FormAlert>
        Your account is ready. <a href="#sign-in">Sign in</a>
      </FormAlert>,
    );
    expect(screen.getByRole("alert")).toContainElement(
      screen.getByRole("link", { name: "Sign in" }),
    );
  });
});
