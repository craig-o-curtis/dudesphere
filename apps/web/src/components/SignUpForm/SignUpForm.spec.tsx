import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AUTH_MESSAGES, initialAuthFormState, type AuthFormState } from "@/lib/actions/auth-state";

import { SignUpForm } from "./SignUpForm";

const { signUp, search } = vi.hoisted(() => ({ signUp: vi.fn(), search: { query: "" } }));
vi.mock("@/lib/actions/auth", () => ({ signUp }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search.query) }));

function renderForm() {
  const user = userEvent.setup();
  return { user, ...render(<SignUpForm />) };
}

// The required fields are filled by typing, as a member would.
async function submit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email"), "e2e-walter@example.com");
  await user.type(screen.getByLabelText("Display name"), "Walter");
  await user.type(screen.getByLabelText("Username"), "e2e-walter");
  await user.type(screen.getByLabelText("Password"), "not-a-real-password");
  await user.click(screen.getByRole("button", { name: "Sign up" }));
}

beforeEach(() => {
  signUp.mockReset();
  signUp.mockResolvedValue(initialAuthFormState);
  search.query = "";
});

describe("SignUpForm", () => {
  it("has the four fields in order with their autocomplete", () => {
    const { container } = renderForm();
    const names = [...container.querySelectorAll("input:not([type=hidden])")].map((i) =>
      i.getAttribute("name"),
    );
    expect(names).toEqual(["email", "displayName", "username", "password"]);
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Display name")).toHaveAttribute("autocomplete", "nickname");
    expect(screen.getByLabelText("Username")).toHaveAttribute("autocomplete", "off");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
  });

  it("makes every field required", () => {
    renderForm();
    for (const label of ["Email", "Display name", "Username", "Password"]) {
      expect(screen.getByLabelText(label)).toBeRequired();
    }
  });

  it("copies the Nest limits as native attributes", () => {
    renderForm();
    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("maxlength", "100");
    const displayName = screen.getByLabelText("Display name");
    expect(displayName).toHaveAttribute("minlength", "2");
    expect(displayName).toHaveAttribute("maxlength", "50");
    const username = screen.getByLabelText("Username");
    expect(username).toHaveAttribute("minlength", "3");
    expect(username).toHaveAttribute("maxlength", "24");
    const pattern = new RegExp(`^(?:${username.getAttribute("pattern")})$`, "v");
    expect(pattern.test("e2e-walter")).toBe(true);
    expect(pattern.test("has space")).toBe(false);
    expect(pattern.test("has@sign")).toBe(false);
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("minlength", "12");
    expect(password).toHaveAttribute("maxlength", "128");
  });

  it("refuses an email with no dot in its domain, as Nest does", async () => {
    const { user } = renderForm();
    const email = screen.getByLabelText<HTMLInputElement>("Email");
    await user.type(email, "e2e-0123456789ab@example");
    expect(email.checkValidity()).toBe(false);
    await user.type(email, ".com");
    expect(email.checkValidity()).toBe(true);
  });

  it("needs a top-level domain of two or more characters", async () => {
    const { user } = renderForm();
    const email = screen.getByLabelText<HTMLInputElement>("Email");
    await user.type(email, "a@b.c");
    expect(email.checkValidity()).toBe(false);
    await user.type(email, "o");
    expect(email.checkValidity()).toBe(true);
  });

  it("refuses a display name of only spaces", async () => {
    const { user } = renderForm();
    const name = screen.getByLabelText<HTMLInputElement>("Display name");
    await user.type(name, "    ");
    expect(name.checkValidity()).toBe(false);
    await user.clear(name);
    await user.type(name, " a ");
    expect(name.checkValidity()).toBe(false);
    await user.clear(name);
    await user.type(name, "Walter S");
    expect(name.checkValidity()).toBe(true);
  });

  it("counts a password in code points with a pattern, as Nest does", () => {
    renderForm();
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("minlength", "12");
    const pattern = new RegExp(`^(?:${password.getAttribute("pattern")})$`, "v");
    expect(pattern.test("😀".repeat(6))).toBe(false);
    expect(pattern.test("😀".repeat(12))).toBe(true);
    expect(pattern.test("a".repeat(129))).toBe(false);
  });

  it("moves focus to the first invalid field after a failed submit, in field order", async () => {
    signUp.mockResolvedValue({
      ...initialAuthFormState,
      fieldErrors: { username: ["taken"], password: ["too short"] },
    } satisfies AuthFormState);
    const { user } = renderForm();
    expect(screen.getByLabelText("Email")).not.toHaveFocus();
    await submit(user);
    // Form moves focus in an effect after the state arrives, so wait for it.
    await waitFor(() => expect(screen.getByLabelText("Username")).toHaveFocus());
  });

  it("leaves focus alone when only a form error comes back", async () => {
    signUp.mockResolvedValue({ ...initialAuthFormState, formError: AUTH_MESSAGES.badCredentials });
    const { user } = renderForm();
    await submit(user);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // Focus stays on the button the member pressed.
    expect(screen.getByRole("button", { name: "Sign up" })).toHaveFocus();
  });

  it("links the hints with aria-describedby", () => {
    renderForm();
    const cases: [string, string][] = [
      ["Display name", "The name other members see."],
      ["Username", "Used to sign in. It isn't shown on your profile. No @ or spaces."],
      ["Password", "12 to 128 characters."],
    ];
    for (const [label, hint] of cases) {
      const ids = screen.getByLabelText(label).getAttribute("aria-describedby")!.split(" ");
      expect(ids.map((id) => document.getElementById(id)?.textContent)).toContain(hint);
    }
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-describedby");
  });

  it("has the button, the sign-in link, the next-less cookie note and no alert", () => {
    renderForm();
    expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument();
    expect(screen.getByText(/Already a member\?/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.getByText(/Signing in sets two cookies/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("carries next on the sign-in link and a hidden field when ?next= is set", () => {
    search.query = "next=/abidings/new";
    const { container } = renderForm();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?next=%2Fabidings%2Fnew",
    );
    expect(container.querySelector('input[name="next"]')).toHaveValue("/abidings/new");
  });

  it("shows errors per field, with the hint kept in aria-describedby", async () => {
    signUp.mockResolvedValue({
      ...initialAuthFormState,
      fieldErrors: {
        email: ["That email already has an account. Sign in instead."],
        displayName: [AUTH_MESSAGES.displayNameTaken],
        username: [AUTH_MESSAGES.usernameTaken],
        password: ["password must be longer than or equal to 12 characters"],
      },
    } satisfies AuthFormState);
    const { user } = renderForm();
    await submit(user);
    const expected: [string, string][] = [
      ["Email", "That email already has an account. Sign in instead."],
      ["Display name", AUTH_MESSAGES.displayNameTaken],
      ["Username", AUTH_MESSAGES.usernameTaken],
      ["Password", "password must be longer than or equal to 12 characters"],
    ];
    for (const [label, message] of expected) {
      // The errors arrive after the action resolves, so wait for them.
      await waitFor(() =>
        expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true"),
      );
      const input = screen.getByLabelText(label);
      const texts = input
        .getAttribute("aria-describedby")!
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent);
      expect(texts).toContain(message);
    }
    const hints = screen.getByLabelText("Password").getAttribute("aria-describedby")!.split(" ");
    expect(hints).toHaveLength(2);
  });

  it("keeps what was typed, never the password", async () => {
    signUp.mockResolvedValue({
      ...initialAuthFormState,
      formError: AUTH_MESSAGES.unavailable,
      values: { email: "e2e-walter@example.com", displayName: "Walter", username: "e2e-walter" },
    });
    const { user } = renderForm();
    await submit(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(AUTH_MESSAGES.unavailable);
    expect(screen.getByLabelText("Email")).toHaveValue("e2e-walter@example.com");
    expect(screen.getByLabelText("Display name")).toHaveValue("Walter");
    expect(screen.getByLabelText("Username")).toHaveValue("e2e-walter");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });

  it("shows the half-finished message with a plain Sign in link", async () => {
    signUp.mockResolvedValue({
      ...initialAuthFormState,
      formError: AUTH_MESSAGES.accountReady,
      accountReady: true,
    });
    const { user } = renderForm();
    await submit(user);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(AUTH_MESSAGES.accountReady);
    const link = alert.querySelector("a")!;
    expect(link).toHaveTextContent("Sign in");
    expect(link).toHaveAttribute("href", "/login");
  });

  it("puts next on the half-finished Sign in link", async () => {
    signUp.mockResolvedValue({
      ...initialAuthFormState,
      formError: AUTH_MESSAGES.accountReady,
      accountReady: true,
      next: "/abidings/new",
    });
    const { user } = renderForm();
    await submit(user);
    const alert = await screen.findByRole("alert");
    expect(alert.querySelector("a")).toHaveAttribute("href", "/login?next=%2Fabidings%2Fnew");
  });

  it("reads Signing up… while pending and the button stays focusable", async () => {
    let finish: (state: AuthFormState) => void = () => {};
    signUp.mockReturnValue(new Promise<AuthFormState>((resolve) => (finish = resolve)));
    const { user } = renderForm();
    await submit(user);
    const button = await screen.findByRole("button", { name: "Signing up…" });
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    await act(async () => finish(initialAuthFormState));
    expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument();
  });
});
