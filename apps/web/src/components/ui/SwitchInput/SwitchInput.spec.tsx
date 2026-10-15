import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { SwitchInput } from "./SwitchInput";

describe("SwitchInput", () => {
  it("has the switch role and its accessible name", () => {
    render(<SwitchInput aria-label="Email me" name="notify" />);
    const el = screen.getByRole("switch", { name: "Email me" });
    expect(el).toHaveAttribute("type", "checkbox");
    expect(el).not.toBeChecked();
  });

  it("reports checked state to assistive tech", () => {
    render(<SwitchInput aria-label="Email me" defaultChecked />);
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("merges className, keeps its own class", () => {
    render(<SwitchInput aria-label="A" className="extra" />);
    const el = screen.getByRole("switch");
    expect(el).toHaveClass("extra");
    expect(el.classList.length).toBeGreaterThan(1);
  });

  it("passes native props and ref", () => {
    const ref = createRef<HTMLInputElement>();
    render(<SwitchInput ref={ref} aria-label="A" aria-describedby="h" data-testid="s" />);
    const el = screen.getByTestId("s");
    expect(el).toHaveAttribute("aria-describedby", "h");
    expect(ref.current).toBe(el);
  });

  it("posts its value in FormData like a checkbox", async () => {
    const user = userEvent.setup();
    render(
      <form aria-label="f">
        <SwitchInput aria-label="Email me" name="notify" value="on" />
      </form>,
    );
    const form = screen.getByRole("form") as HTMLFormElement;
    expect(new FormData(form).get("notify")).toBeNull();
    await user.click(screen.getByRole("switch"));
    expect(new FormData(form).get("notify")).toBe("on");
  });
});
