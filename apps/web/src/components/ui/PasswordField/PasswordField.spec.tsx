import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Form } from "../Form/Form";
import { PasswordField } from "./PasswordField";

function input() {
  return screen.getByLabelText("Password") as HTMLInputElement;
}

describe("PasswordField", () => {
  it("names the control by its label and has a show button", () => {
    render(<PasswordField name="password" label="Password" />);
    expect(input()).toHaveAttribute("type", "password");
    expect(input()).toHaveAttribute("name", "password");
    expect(screen.getByRole("button", { name: "Show password" })).toBeInTheDocument();
  });

  it("merges className on the root and keeps its own class", () => {
    const { container } = render(<PasswordField name="p" label="Password" className="extra" />);
    const root = container.firstElementChild!;
    expect(root).toHaveClass("extra");
    expect(root.classList.length).toBeGreaterThan(1);
  });

  it("passes native props and ref to the input", () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <PasswordField
        name="p"
        label="Password"
        ref={ref}
        autoComplete="new-password"
        minLength={12}
        data-testid="i"
      />,
    );
    expect(screen.getByTestId("i")).toHaveAttribute("minlength", "12");
    expect(screen.getByTestId("i")).toHaveAttribute("autocomplete", "new-password");
    expect(ref.current).toBe(input());
  });

  it("links the hint and error to the input", () => {
    render(<PasswordField name="p" label="Password" hint="12 or more." errors="Too short." />);
    expect(input()).toHaveAttribute("aria-invalid", "true");
    expect(input()).toHaveAttribute(
      "aria-describedby",
      `${screen.getByText("12 or more.").id} ${screen.getByText("Too short.").id}`,
    );
  });

  it("focuses the field on new form errors and clears on edit", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Form aria-label="form" errors={{}}>
        <PasswordField name="p" label="Password" />
      </Form>,
    );
    rerender(
      <Form aria-label="form" errors={{ p: ["Bad."] }}>
        <PasswordField name="p" label="Password" />
      </Form>,
    );
    expect(input()).toHaveFocus();
    await user.type(input(), "x");
    expect(screen.queryByText("Bad.")).not.toBeInTheDocument();
    expect(input()).not.toHaveAttribute("aria-invalid");
  });

  it("puts the label, ids, error and no novalidate in the server HTML", () => {
    const html = renderToString(
      <Form aria-label="form" errors={{ p: ["Bad."] }}>
        <PasswordField name="p" label="Password" hint="A hint" />
      </Form>,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const field = doc.querySelector("input")!;
    const ids = field.getAttribute("aria-describedby")!.split(" ");
    expect(doc.querySelector("label")!.getAttribute("for")).toBe(field.id);
    expect(doc.getElementById(ids[0]!)!.textContent).toBe("A hint");
    expect(doc.getElementById(ids[1]!)!.textContent).toBe("Bad.");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(html).not.toMatch(/novalidate/i);
  });
});
