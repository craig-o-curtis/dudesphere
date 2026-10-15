import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PasswordInput } from "./PasswordInput";

function input() {
  return screen.getByLabelText("Password") as HTMLInputElement;
}

describe("PasswordInput", () => {
  it("renders a password input and a named toggle button", () => {
    render(<PasswordInput aria-label="Password" name="password" />);
    expect(input()).toHaveAttribute("type", "password");
    expect(input()).toHaveAttribute("name", "password");
    const button = screen.getByRole("button", { name: "Show password" });
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveAttribute("aria-controls", input().id);
    expect(input().id).not.toBe("");
  });

  it("toggles type and aria-pressed, and the button keeps focus", async () => {
    const user = userEvent.setup();
    render(<PasswordInput aria-label="Password" />);
    const button = screen.getByRole("button", { name: "Show password" });
    button.focus();
    await user.click(button);
    expect(input()).toHaveAttribute("type", "text");
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveFocus();
    await user.click(button);
    expect(input()).toHaveAttribute("type", "password");
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps name, autocomplete and native rules in both states", async () => {
    const user = userEvent.setup();
    render(
      <PasswordInput
        aria-label="Password"
        name="password"
        autoComplete="new-password"
        required
        minLength={12}
        maxLength={128}
        pattern=".{12,128}"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input()).toHaveAttribute("name", "password");
    expect(input()).toHaveAttribute("autocomplete", "new-password");
    expect(input()).toBeRequired();
    expect(input()).toHaveAttribute("minlength", "12");
    expect(input()).toHaveAttribute("pattern", ".{12,128}");
  });

  it("uses an id the caller passes", () => {
    render(<PasswordInput aria-label="Password" id="pw" />);
    expect(input().id).toBe("pw");
    expect(screen.getByRole("button", { name: "Show password" })).toHaveAttribute(
      "aria-controls",
      "pw",
    );
  });

  it("hides the icons from screen readers", () => {
    const { container } = render(<PasswordInput aria-label="Password" />);
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("merges className, passes ref and native props to the input", () => {
    const ref = createRef<HTMLInputElement>();
    render(<PasswordInput ref={ref} aria-label="Password" className="extra" data-testid="p" />);
    expect(input()).toHaveClass("extra");
    expect(input().classList.length).toBeGreaterThan(1);
    expect(ref.current).toBe(input());
    expect(input()).toHaveAttribute("data-testid", "p");
  });

  it("is not usable before hydration", () => {
    const html = renderToString(<PasswordInput aria-label="Password" />);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const button = doc.querySelector("button")!;
    expect(button.hasAttribute("inert")).toBe(true);
    expect(button.getAttribute("data-ready")).toBe("false");
    expect(doc.querySelector("input")!.getAttribute("type")).toBe("password");
  });

  it("is usable after hydration", () => {
    render(<PasswordInput aria-label="Password" />);
    const button = screen.getByRole("button", { name: "Show password" });
    expect(button).not.toHaveAttribute("inert");
    expect(button).toHaveAttribute("data-ready", "true");
  });

  it("asks for no spell check, autocorrect or autocapitalize, shown or hidden", async () => {
    // Showing the password makes the input type="text". Spell checkers outside
    // Chromium (Edge's Microsoft Editor, extensions) may send checked text to a
    // cloud service, so the input must ask them to leave it alone.
    const user = userEvent.setup();
    render(<PasswordInput aria-label="Password" name="password" />);
    for (const type of ["password", "text"]) {
      expect(input()).toHaveAttribute("type", type);
      expect(input()).toHaveAttribute("spellcheck", "false");
      expect(input()).toHaveAttribute("autocorrect", "off");
      expect(input()).toHaveAttribute("autocapitalize", "off");
      if (type === "password")
        await user.click(screen.getByRole("button", { name: "Show password" }));
    }
  });

  it("hides the password again when its form submits, and still posts it", async () => {
    const user = userEvent.setup();
    let posted: FormDataEntryValue | null = null;
    render(
      <form
        aria-label="f"
        onSubmit={(event) => {
          event.preventDefault();
          posted = new FormData(event.currentTarget).get("password");
        }}
      >
        <PasswordInput aria-label="Password" name="password" />
        <button type="submit">Send</button>
      </form>,
    );
    const toggle = screen.getByRole("button", { name: "Show password" });
    await user.type(input(), "correct horse");
    await user.click(toggle);
    expect(input()).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(posted).toBe("correct horse");
    expect(input()).toHaveAttribute("type", "password");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(input()).toHaveValue("correct horse");
  });

  it("keeps spell check, autocorrect and autocapitalize off whatever the caller passes (SEC-2)", async () => {
    const user = userEvent.setup();
    const risky = { spellCheck: true, autoCorrect: "on", autoCapitalize: "sentences" };
    // The props type rejects these, so a typed caller can't try. A caller that
    // gets past the types, such as a shared props object, must not win either.
    render(<PasswordInput aria-label="Password" name="password" {...(risky as object)} />);
    // @ts-expect-error the part owns spellCheck
    expect(<PasswordInput spellCheck />).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Show password" }));

    expect(input()).toHaveAttribute("type", "text");
    expect(input()).toHaveAttribute("spellcheck", "false");
    expect(input()).toHaveAttribute("autocorrect", "off");
    expect(input()).toHaveAttribute("autocapitalize", "off");
  });

  it("keeps a callback ref's cleanup: it runs on unmount and the ref never gets null (QA-15)", () => {
    const cleanup = vi.fn();
    const seen: (HTMLInputElement | null)[] = [];
    const ref = (node: HTMLInputElement | null) => {
      seen.push(node);
      return cleanup;
    };
    const { unmount } = render(<PasswordInput aria-label="Password" ref={ref} />);
    unmount();
    expect(cleanup).toHaveBeenCalled();
    expect(seen).not.toContain(null);
  });
});
