import { act, render, screen } from "@testing-library/react";

import { AUTH_MESSAGES, initialAuthFormState, type AuthFormState } from "@/lib/actions/auth-state";

import { SignInForm } from "./SignInForm";

const { signIn } = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock("@/lib/actions/auth", () => ({ signIn }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));

function renderForm() {
  return render(<SignInForm />);
}

// jsdom checks the required fields, so fill them before submitting.
function submit(form: HTMLFormElement) {
  form.querySelector<HTMLInputElement>('[name="identifier"]')!.value = "e2e-dude@example.com";
  form.querySelector<HTMLInputElement>('[name="password"]')!.value = "not-a-real-password";
  return act(async () => {
    form.requestSubmit();
  });
}

beforeEach(() => {
  signIn.mockReset();
  signIn.mockResolvedValue(initialAuthFormState);
});

describe("SignInForm", () => {
  it("has an Email field with native constraints copied from SignInDto", () => {
    renderForm();
    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("name", "identifier");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "username");
    expect(email).toBeRequired();
    expect(email).toHaveAttribute("maxlength", "100");
  });

  it("refuses an email with no dot in its domain, as Nest does", () => {
    renderForm();
    const email = screen.getByLabelText<HTMLInputElement>("Email");
    email.value = "e2e-dude@example";
    expect(email.checkValidity()).toBe(false);
    email.value = "e2e-dude@example.com";
    expect(email.checkValidity()).toBe(true);
  });

  it("needs a top-level domain of two or more characters", () => {
    renderForm();
    const email = screen.getByLabelText<HTMLInputElement>("Email");
    email.value = "a@b.c";
    expect(email.checkValidity()).toBe(false);
    email.value = "a@b.co";
    expect(email.checkValidity()).toBe(true);
  });

  it("moves focus to the first invalid field after a failed submit", async () => {
    signIn.mockResolvedValue({
      ...initialAuthFormState,
      fieldErrors: { password: ["password should not be empty"] },
    });
    const { container } = renderForm();
    expect(screen.getByLabelText("Password")).not.toHaveFocus();
    await submit(container.querySelector("form")!);
    expect(screen.getByLabelText("Password")).toHaveFocus();
  });

  it("leaves focus alone when only a form error comes back", async () => {
    signIn.mockResolvedValue({ ...initialAuthFormState, formError: AUTH_MESSAGES.badCredentials });
    const { container } = renderForm();
    await submit(container.querySelector("form")!);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(document.body).toHaveFocus();
  });

  it("has a Password field with no length rule beyond required", () => {
    renderForm();
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("name", "password");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(password).toBeRequired();
    expect(password).not.toHaveAttribute("minlength");
    expect(password).not.toHaveAttribute("maxlength");
  });

  it("has a Sign in button and a link to sign up", () => {
    renderForm();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/signup");
    expect(screen.getByText(/New here\?/)).toBeInTheDocument();
  });

  it("has the cookie note and no forgot-password link", () => {
    renderForm();
    expect(screen.getByText(/Signing in sets two cookies/)).toBeInTheDocument();
    expect(screen.queryByText(/forgot/i)).toBeNull();
  });

  it("posts a form action with no alert at first", () => {
    const { container } = renderForm();
    expect(container.querySelector("form")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
  });

  it("shows the form error in an alert", async () => {
    signIn.mockResolvedValue({
      ...initialAuthFormState,
      formError: AUTH_MESSAGES.badCredentials,
      values: { identifier: "e2e-walter@example.com" },
    } satisfies AuthFormState);
    const { container } = renderForm();
    await submit(container.querySelector("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(AUTH_MESSAGES.badCredentials);
  });

  it("keeps what was typed through defaultValue, never the password", async () => {
    signIn.mockResolvedValue({
      ...initialAuthFormState,
      formError: AUTH_MESSAGES.badCredentials,
      values: { identifier: "e2e-walter@example.com" },
    });
    const { container } = renderForm();
    await submit(container.querySelector("form")!);
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Email")).toHaveValue("e2e-walter@example.com");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });

  it("links field errors with aria-describedby and sets aria-invalid", async () => {
    signIn.mockResolvedValue({
      ...initialAuthFormState,
      fieldErrors: {
        identifier: ["identifier must be shorter"],
        password: ["password should not be empty"],
      },
    });
    const { container } = renderForm();
    await submit(container.querySelector("form")!);
    const email = await screen.findByLabelText("Email");
    expect(email).toHaveAttribute("aria-invalid", "true");
    const emailError = document.getElementById(email.getAttribute("aria-describedby")!);
    expect(emailError).toHaveTextContent("identifier must be shorter");
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(password.getAttribute("aria-describedby")!)).toHaveTextContent(
      "password should not be empty",
    );
  });

  it("reads Signing in… while pending and the button stays focusable", async () => {
    let finish: (state: AuthFormState) => void = () => {};
    signIn.mockReturnValue(new Promise<AuthFormState>((resolve) => (finish = resolve)));
    const { container } = renderForm();
    await submit(container.querySelector("form")!);
    const button = screen.getByRole("button", { name: "Signing in…" });
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    button.focus();
    expect(button).toHaveFocus();
    await act(async () => finish(initialAuthFormState));
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});
