import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AuthForm } from "./AuthForm";

function renderForm(props: Partial<React.ComponentProps<typeof AuthForm>> = {}) {
  return render(
    <AuthForm
      action={() => {}}
      fieldErrors={{}}
      formError={null}
      pending={false}
      submitLabel="Sign in"
      pendingLabel="Signing in…"
      alt={<>New here?</>}
      {...props}
    >
      <input aria-label="field" />
    </AuthForm>,
  );
}

describe("AuthForm", () => {
  it("renders the frame around its fields, with no next field and no cookie note", () => {
    const { container } = renderForm();
    expect(screen.getByLabelText("field")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveAttribute("type", "submit");
    expect(screen.getByText("New here?")).toBeInTheDocument();
    expect(screen.queryByText(/cookies/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.querySelector('input[name="next"]')).toBeNull();
  });

  it("says all fields are required, in visible text above the fields", () => {
    renderForm();
    const cue = screen.getByText("All fields are required.");
    expect(cue).toBeVisible();
    expect(cue.compareDocumentPosition(screen.getByLabelText("field"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("shows the footer under the alt line", () => {
    renderForm({ footer: <p>A footer note</p> });
    const alt = screen.getByText("New here?");
    expect(alt.compareDocumentPosition(screen.getByText("A footer note"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("calls onSubmit before the action", async () => {
    const calls: string[] = [];
    renderForm({
      action: () => void calls.push("action"),
      onSubmit: () => void calls.push("submit"),
    });
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(calls).toEqual(["submit", "action"]);
  });

  it("shows the pending label and the form error", () => {
    renderForm({ formError: <>Broken</>, pending: true, alt: null });
    expect(screen.getByRole("button", { name: "Signing in…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Broken");
  });
});
