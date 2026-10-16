import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AUTH_MESSAGES } from "@/lib/actions/auth-state";
import {
  initialForgotPasswordFormState,
  type ForgotPasswordFormState,
} from "@/lib/actions/password-state";

import { ForgotPasswordForm } from "./ForgotPasswordForm";

const { requestReset } = vi.hoisted(() => ({ requestReset: vi.fn() }));
vi.mock("@/lib/actions/password", () => ({ requestReset }));

async function submit(result: ForgotPasswordFormState) {
  requestReset.mockResolvedValue(result);
  const user = userEvent.setup();
  render(<ForgotPasswordForm />);
  await user.type(screen.getByLabelText("Email"), "e2e-dude@example.com");
  await user.click(screen.getByRole("button", { name: "Send the link" }));
}

beforeEach(() => requestReset.mockReset());

describe("ForgotPasswordForm", () => {
  it("has one required Email field and a way back to sign in", () => {
    const { container } = render(<ForgotPasswordForm />);
    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("name", "email");
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(email).toBeRequired();
    expect(container.querySelectorAll("input:not([type=hidden])")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("shows Nest's field errors under Email and keeps what was typed", async () => {
    await submit({
      ...initialForgotPasswordFormState,
      fieldErrors: { email: ["email must be an email"] },
      values: { email: "e2e-dude@example.com" },
    });
    expect(await screen.findByText("email must be an email")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInvalid();
    expect(screen.getByLabelText("Email")).toHaveValue("e2e-dude@example.com");
  });

  it("shows the wait for a 429", async () => {
    await submit({
      ...initialForgotPasswordFormState,
      formError: "Easy, man. Try again in 5 minutes.",
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Easy, man. Try again in 5 minutes.",
    );
  });

  it("shows the unavailable message", async () => {
    await submit({ ...initialForgotPasswordFormState, formError: AUTH_MESSAGES.unavailable });
    expect(await screen.findByRole("alert")).toHaveTextContent(AUTH_MESSAGES.unavailable);
  });
});
