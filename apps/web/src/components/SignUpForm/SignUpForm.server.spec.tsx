import { renderToString } from "react-dom/server";

import { AUTH_MESSAGES, initialAuthFormState, type AuthFormState } from "@/lib/actions/auth-state";

import { SignUpForm } from "./SignUpForm";

const { state } = vi.hoisted(() => ({ state: { current: null as unknown } }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState: () => [state.current, () => {}, false],
}));
vi.mock("@/lib/actions/auth", () => ({ signUp: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));

function html(next: AuthFormState) {
  state.current = next;
  const div = document.createElement("div");
  div.innerHTML = renderToString(<SignUpForm />);
  return div;
}

describe("SignUpForm on the server with an error state", () => {
  const withErrors = {
    ...initialAuthFormState,
    fieldErrors: {
      email: [AUTH_MESSAGES.emailTaken],
      username: [AUTH_MESSAGES.usernameTaken],
      password: ["password must be longer than or equal to 12 characters"],
    },
    values: { email: "e2e-walter@example.com", displayName: "Walter", username: "e2e-walter" },
  } satisfies AuthFormState;

  it("renders errors, hint and error ids, and native rules without JavaScript", () => {
    const root = html(withErrors);
    expect(root.querySelector("form")).not.toHaveAttribute("novalidate");
    const cases: [string, string, string | null][] = [
      ["email", AUTH_MESSAGES.emailTaken, null],
      [
        "username",
        AUTH_MESSAGES.usernameTaken,
        "Used to sign in. It isn't shown on your profile. No @ or spaces.",
      ],
      [
        "password",
        "password must be longer than or equal to 12 characters",
        "12 to 128 characters.",
      ],
    ];
    for (const [name, error, hint] of cases) {
      const input = root.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAttribute("required");
      const texts = input
        .getAttribute("aria-describedby")!
        .split(" ")
        .map((id) => root.querySelector(`[id="${id}"]`)?.textContent);
      expect(texts).toContain(error);
      if (hint) expect(texts).toContain(hint);
    }
    expect(root.querySelector('[name="username"]')).toHaveAttribute("minlength", "3");
    expect(root.querySelector('[name="password"]')).toHaveAttribute("pattern", ".{12,128}");
    expect(root.querySelector('[name="displayName"]')).not.toHaveAttribute("aria-invalid");
    expect(root.querySelector('[name="displayName"]')).toHaveAttribute("value", "Walter");
  });

  it("renders the Sign in link in the alert when the account is ready", () => {
    const root = html({
      ...initialAuthFormState,
      formError: AUTH_MESSAGES.accountReady,
      accountReady: true,
      next: "/abidings/new",
    });
    const link = root.querySelector('[role="alert"] a')!;
    expect(link).toHaveAttribute("href", "/login?next=%2Fabidings%2Fnew");
  });
});
