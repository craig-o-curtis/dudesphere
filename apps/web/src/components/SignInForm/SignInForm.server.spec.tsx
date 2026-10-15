import { renderToString } from "react-dom/server";

import { AUTH_MESSAGES, initialAuthFormState, type AuthFormState } from "@/lib/actions/auth-state";

import { SignInForm } from "./SignInForm";

const { state } = vi.hoisted(() => ({ state: { current: null as unknown } }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useActionState: () => [state.current, () => {}, false],
}));
vi.mock("@/lib/actions/auth", () => ({ signIn: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));

function html(next: AuthFormState) {
  state.current = next;
  const div = document.createElement("div");
  div.innerHTML = renderToString(<SignInForm />);
  return div;
}

describe("SignInForm on the server with an error state", () => {
  const withErrors = {
    ...initialAuthFormState,
    formError: AUTH_MESSAGES.badCredentials,
    fieldErrors: { identifier: ["identifier must be shorter"] },
    values: { identifier: "e2e-walter@example.com" },
  } satisfies AuthFormState;

  it("renders the errors, aria wiring and native rules without JavaScript", () => {
    const root = html(withErrors);
    expect(root.querySelector("form")).not.toHaveAttribute("novalidate");
    expect(root.querySelector('[role="alert"]')).toHaveTextContent(AUTH_MESSAGES.badCredentials);
    const email = root.querySelector<HTMLInputElement>('[name="identifier"]')!;
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute("required");
    expect(email).toHaveAttribute("pattern");
    expect(email).toHaveAttribute("maxlength", "100");
    expect(email).toHaveAttribute("value", "e2e-walter@example.com");
    const ids = email.getAttribute("aria-describedby")!.split(" ");
    expect(ids.map((id) => root.querySelector(`[id="${id}"]`)?.textContent)).toContain(
      "identifier must be shorter",
    );
  });
});
