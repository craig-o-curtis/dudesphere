import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  initialResetPasswordFormState,
  PASSWORD_MESSAGES,
  type ResetPasswordFormState,
} from "@/lib/actions/password-state";

import { ResetPasswordForm } from "./ResetPasswordForm";

const { resetPassword } = vi.hoisted(() => ({ resetPassword: vi.fn() }));
vi.mock("@/lib/actions/password", () => ({ resetPassword }));

const TOKEN = "e2e-not-a-real-token";

async function submit(result: ResetPasswordFormState) {
  resetPassword.mockResolvedValue(result);
  const user = userEvent.setup();
  const view = render(<ResetPasswordForm token={TOKEN} />);
  await user.type(screen.getByLabelText("New password"), "not-a-real-password");
  await user.type(screen.getByLabelText("Same again"), "not-a-real-password");
  await user.click(screen.getByRole("button", { name: "Change password" }));
  return view;
}

beforeEach(() => {
  resetPassword.mockReset();
  window.history.replaceState(null, "", `/reset-password?token=${TOKEN}`);
});

describe("ResetPasswordForm", () => {
  it("has a hidden token and two new-password fields", () => {
    const { container } = render(<ResetPasswordForm token={TOKEN} />);
    expect(container.querySelector("input[name=token]")).toHaveAttribute("type", "hidden");
    expect(container.querySelector("input[name=token]")).toHaveValue(TOKEN);
    for (const label of ["New password", "Same again"]) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute("autocomplete", "new-password");
      expect(input).toBeRequired();
    }
    expect(screen.getByLabelText("New password")).toHaveAttribute("name", "password");
    expect(screen.getByLabelText("Same again")).toHaveAttribute("name", "confirmPassword");
  });

  it("takes the token out of the address bar after the input renders", () => {
    const { container } = render(<ResetPasswordForm token={TOKEN} />);
    expect(container.querySelector("input[name=token]")).toHaveValue(TOKEN);
    expect(window.location.search).toBe("");
    expect(window.location.pathname).toBe("/reset-password");
  });

  it("strips the token with no history state, so Next's router drops it too", () => {
    const spy = vi.spyOn(window.history, "replaceState");
    render(<ResetPasswordForm token={TOKEN} />);
    expect(spy).toHaveBeenCalledWith(null, "", "/reset-password");
    spy.mockRestore();
  });

  it("shows field errors under New password and Same again, and keeps the token", async () => {
    const { container } = await submit({
      ...initialResetPasswordFormState,
      fieldErrors: {
        password: ["password is too weak"],
        confirmPassword: [PASSWORD_MESSAGES.mismatch],
      },
    });
    expect(await screen.findByText("password is too weak")).toBeInTheDocument();
    expect(screen.getByText(PASSWORD_MESSAGES.mismatch)).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInvalid();
    expect(screen.getByLabelText("Same again")).toBeInvalid();
    expect(container.querySelector("input[name=token]")).toHaveValue(TOKEN);
  });

  it("swaps the form for the invalid link state when Nest refuses the token", async () => {
    await submit({
      ...initialResetPasswordFormState,
      linkInvalid: true,
      formError: PASSWORD_MESSAGES.linkInvalid,
    });
    expect(await screen.findByText(PASSWORD_MESSAGES.linkInvalid)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ask for a new link" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(screen.queryByText("All fields are required.")).not.toBeInTheDocument();
    // The form held focus and is gone, so focus moves to the message and link.
    await waitFor(() => expect(screen.getByRole("alert").parentElement).toHaveFocus());
  });

  it("shows the invalid state and no form for a missing token", () => {
    render(<ResetPasswordForm token={null} />);
    expect(screen.getByText(PASSWORD_MESSAGES.linkInvalid)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ask for a new link" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change password" })).not.toBeInTheDocument();
    expect(screen.queryByText("All fields are required.")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(PASSWORD_MESSAGES.linkInvalid);
    // First load: the page keeps its normal focus order.
    expect(document.body).toHaveFocus();
  });
});
