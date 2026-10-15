import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Form } from "../Form/Form";
import { useField } from "./useField";

function Probe({
  name = "email",
  hint = true,
  errors,
  invalid,
  describedBy,
  onChange,
}: {
  name?: string;
  hint?: boolean;
  errors?: string | string[];
  invalid?: boolean;
  describedBy?: string;
  onChange?: (value: string) => void;
}) {
  const field = useField({
    name,
    hint,
    errors,
    invalid,
    describedBy,
    onChange: (event) => onChange?.(event.currentTarget.value),
  });
  return (
    <>
      <label htmlFor={field.inputProps.id}>Email</label>
      <input {...field.inputProps} />
      {hint ? <p id={field.hintId}>A hint</p> : null}
      {field.messages.length > 0 ? <p id={field.errorId}>{field.messages.join(" ")}</p> : null}
    </>
  );
}

describe("useField", () => {
  it("gives the input an id and name, and links the hint", () => {
    render(<Probe />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("name", "email");
    expect(input).toHaveAttribute("aria-describedby", screen.getByText("A hint").id);
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("sets no aria-describedby with no hint and no error", () => {
    render(<Probe hint={false} />);
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-describedby");
  });

  it("reads the form's errors by name", () => {
    render(
      <Form aria-label="f" errors={{ email: ["Bad."], other: ["No."] }}>
        <Probe />
      </Form>,
    );
    const input = screen.getByLabelText("Email");
    const error = screen.getByText("Bad.");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute(
      "aria-describedby",
      `${screen.getByText("A hint").id} ${error.id}`,
    );
  });

  it("accepts a single string from the form", () => {
    render(
      <Form aria-label="f" errors={{ email: "Bad." }}>
        <Probe />
      </Form>,
    );
    expect(screen.getByText("Bad.")).toBeInTheDocument();
  });

  it("lets the field's own errors override the form's", () => {
    render(
      <Form aria-label="f" errors={{ email: ["From the form."] }}>
        <Probe errors="From the field." />
      </Form>,
    );
    expect(screen.getByText("From the field.")).toBeInTheDocument();
    expect(screen.queryByText("From the form.")).not.toBeInTheDocument();
  });

  it("lets invalid override, and links no error that isn't there", () => {
    render(<Probe hint={false} invalid />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("keeps a described-by the caller passes", () => {
    render(<Probe hint={false} errors="Bad." describedBy="outside" />);
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "aria-describedby",
      `outside ${screen.getByText("Bad.").id}`,
    );
  });

  it("clears the error on edit and still calls the caller's onChange", async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    render(
      <Form aria-label="f" errors={{ email: ["Bad."] }}>
        <Probe onChange={(value) => seen.push(value)} />
      </Form>,
    );
    const input = screen.getByLabelText("Email");
    await user.type(input, "w");
    expect(seen).toEqual(["w"]);
    expect(screen.queryByText("Bad.")).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).toHaveAttribute("aria-describedby", screen.getByText("A hint").id);
  });

  it("shows errors again when a new set arrives", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <Form aria-label="f" errors={{ email: ["Bad."] }}>
        <Probe />
      </Form>,
    );
    await user.type(screen.getByLabelText("Email"), "w");
    expect(screen.queryByText("Bad.")).not.toBeInTheDocument();
    rerender(
      <Form aria-label="f" errors={{ email: ["Bad."] }}>
        <Probe />
      </Form>,
    );
    expect(screen.getByText("Bad.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("puts the ids and links in the server HTML", () => {
    const html = renderToString(
      <Form aria-label="f" errors={{ email: ["Bad."] }}>
        <Probe />
      </Form>,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const input = doc.querySelector("input")!;
    const [hintId, errorId] = input.getAttribute("aria-describedby")!.split(" ");
    expect(doc.querySelector("label")!.getAttribute("for")).toBe(input.id);
    expect(doc.getElementById(hintId!)!.textContent).toBe("A hint");
    expect(doc.getElementById(errorId!)!.textContent).toBe("Bad.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });

  describe("a plain string error that comes back after an edit (QA-6)", () => {
    it("shows again, with aria-invalid, when a new errors object arrives", async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <Form aria-label="f" errors={{ email: "No @ or spaces." }}>
          <Probe />
        </Form>,
      );
      const input = screen.getByLabelText("Email");
      await user.type(input, "w");
      expect(screen.queryByText("No @ or spaces.")).not.toBeInTheDocument();

      // The server answers a second submit with the same message, in a new object.
      rerender(
        <Form aria-label="f" errors={{ email: "No @ or spaces." }}>
          <Probe />
        </Form>,
      );
      expect(screen.getByText("No @ or spaces.")).toBeInTheDocument();
      expect(input).toHaveAttribute("aria-invalid", "true");
    });

    it("gets focus from Form when it comes back", async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <Form aria-label="f" errors={undefined}>
          <Probe />
        </Form>,
      );
      const input = screen.getByLabelText("Email");
      rerender(
        <Form aria-label="f" errors={{ email: "No @ or spaces." }}>
          <Probe />
        </Form>,
      );
      await user.type(input, "w");
      await user.tab();
      expect(input).not.toHaveFocus();
      rerender(
        <Form aria-label="f" errors={{ email: "No @ or spaces." }}>
          <Probe />
        </Form>,
      );
      // Form moves focus in an effect, so wait for it.
      await waitFor(() => expect(input).toHaveFocus());
    });
  });

  it("shows a field's own string error again after the errors went away (QA-14)", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Probe errors="No @ or spaces." />);
    const input = screen.getByLabelText("Email");
    await user.type(input, "x");
    expect(screen.queryByText("No @ or spaces.")).not.toBeInTheDocument();

    rerender(<Probe errors={undefined} />);
    rerender(<Probe errors="No @ or spaces." />);

    expect(screen.getByText("No @ or spaces.")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});
