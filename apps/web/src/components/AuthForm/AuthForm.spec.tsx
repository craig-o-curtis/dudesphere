import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AuthForm } from "./AuthForm";

let mockSearch = "next=/x";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(mockSearch) }));

describe("AuthForm", () => {
  it("renders the frame around its fields", () => {
    const { container } = render(
      <AuthForm
        action={() => {}}
        fieldErrors={{}}
        formError={null}
        pending={false}
        submitLabel="Sign in"
        pendingLabel="Signing in…"
        alt={<>New here?</>}
      >
        <input aria-label="field" />
      </AuthForm>,
    );
    expect(screen.getByLabelText("field")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toHaveAttribute("type", "submit");
    expect(screen.getByText("New here?")).toBeInTheDocument();
    expect(screen.getByText(/Signing in sets two cookies/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.querySelector('input[name="next"]')).toHaveValue("/x");
  });

  it("shows the pending label and the form error", () => {
    render(
      <AuthForm
        action={() => {}}
        fieldErrors={{}}
        formError={<>Broken</>}
        pending
        submitLabel="Sign in"
        pendingLabel="Signing in…"
        alt={null}
      >
        {null}
      </AuthForm>,
    );
    expect(screen.getByRole("button", { name: "Signing in…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Broken");
  });

  describe("the next path on submit", () => {
    afterEach(() => {
      mockSearch = "next=/x";
      window.history.replaceState(null, "", "/");
    });

    async function submit() {
      const action = vi.fn();
      render(
        <AuthForm
          action={action}
          fieldErrors={{}}
          formError={null}
          pending={false}
          submitLabel="Sign in"
          pendingLabel="Signing in…"
          alt={null}
        >
          {null}
        </AuthForm>,
      );
      await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
      expect(action).toHaveBeenCalledOnce();
      return action.mock.calls[0][0] as FormData;
    }

    it("adds next from the address when the field is not in the form yet", async () => {
      mockSearch = "";
      window.history.replaceState(null, "", "/login?next=%2Fabidings%2Fnew");
      expect((await submit()).get("next")).toBe("/abidings/new");
    });

    it("keeps the field's value over the address", async () => {
      window.history.replaceState(null, "", "/login?next=%2Fother");
      expect((await submit()).getAll("next")).toEqual(["/x"]);
    });

    it("adds nothing when there is no next anywhere", async () => {
      mockSearch = "";
      expect((await submit()).has("next")).toBe(false);
    });

    it("removes the added input, so a later submit posts next once", async () => {
      mockSearch = "";
      window.history.replaceState(null, "", "/login?next=%2Fabidings%2Fnew");
      const action = vi.fn();
      const form = (
        <AuthForm
          action={action}
          fieldErrors={{}}
          formError={null}
          pending={false}
          submitLabel="Sign in"
          pendingLabel="Signing in…"
          alt={null}
        >
          {null}
        </AuthForm>
      );
      const { container, rerender } = render(form);
      await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
      expect((action.mock.calls[0][0] as FormData).get("next")).toBe("/abidings/new");
      await waitFor(() => expect(container.querySelector('input[name="next"]')).toBeNull());

      mockSearch = "next=/abidings/new";
      rerender(form);
      await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
      expect((action.mock.calls[1][0] as FormData).getAll("next")).toEqual(["/abidings/new"]);
    });
  });
});
