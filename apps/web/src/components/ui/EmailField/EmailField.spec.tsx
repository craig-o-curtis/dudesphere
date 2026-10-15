import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Form } from "../Form/Form";
import { EmailField } from "./EmailField";

describe("EmailField", () => {
  it("names the control by its label", () => {
    render(<EmailField name="f" label="Thing" />);
    const el = screen.getByRole("textbox", { name: "Thing" });
    expect(el).toHaveAttribute("name", "f");
  });

  it("merges className on the root and keeps its own class", () => {
    const { container } = render(<EmailField name="f" label="Thing" className="extra" />);
    const root = container.firstElementChild!;
    expect(root).toHaveClass("extra");
    expect(root.classList.length).toBeGreaterThan(1);
  });

  it("passes native props and ref to the input", () => {
    const ref = createRef<HTMLInputElement>();
    render(<EmailField name="f" label="Thing" ref={ref} required data-testid="i" />);
    const el = screen.getByTestId("i");
    expect(el).toBeRequired();
    expect(ref.current).toBe(el);
  });

  it("links the hint, and shows no error when valid", () => {
    render(<EmailField name="f" label="Thing" hint="A hint" />);
    const el = screen.getByRole("textbox", { name: "Thing" });
    expect(el).toHaveAttribute("aria-describedby", screen.getByText("A hint").id);
    expect(el).not.toHaveAttribute("aria-invalid");
  });

  it("shows its own errors and links hint and error", () => {
    render(<EmailField name="f" label="Thing" hint="A hint" errors={["One.", "Two."]} />);
    const el = screen.getByRole("textbox", { name: "Thing" });
    const error = screen.getByText("One. Two.");
    expect(el).toHaveAttribute("aria-invalid", "true");
    expect(el).toHaveAttribute("aria-describedby", `${screen.getByText("A hint").id} ${error.id}`);
  });

  it("reads the form's errors, focuses the field, and clears on edit", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Form aria-label="form" errors={{}}>
        <EmailField name="f" label="Thing" hint="A hint" />
      </Form>,
    );
    rerender(
      <Form aria-label="form" errors={{ f: ["Bad."] }}>
        <EmailField name="f" label="Thing" hint="A hint" />
      </Form>,
    );
    const el = screen.getByRole("textbox", { name: "Thing" });
    expect(screen.getByText("Bad.")).toBeInTheDocument();
    // Form moves focus in an effect, so wait for it.
    await waitFor(() => expect(el).toHaveFocus());
    await user.type(el, "walter");
    expect(screen.queryByText("Bad.")).not.toBeInTheDocument();
    expect(el).not.toHaveAttribute("aria-invalid");
  });

  it("puts the label, ids, error and no novalidate in the server HTML", () => {
    const html = renderToString(
      <Form aria-label="form" errors={{ f: ["Bad."] }}>
        <EmailField name="f" label="Thing" hint="A hint" required />
      </Form>,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const input = doc.querySelector("input")!;
    const ids = input.getAttribute("aria-describedby")!.split(" ");
    expect(ids).toHaveLength(2);
    expect(doc.querySelector("label")!.getAttribute("for")).toBe(input.id);
    expect(doc.getElementById(ids[0]!)!.textContent).toBe("A hint");
    expect(doc.getElementById(ids[1]!)!.textContent).toBe("Bad.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.hasAttribute("required")).toBe(true);
    expect(html).not.toMatch(/novalidate/i);
  });
});
