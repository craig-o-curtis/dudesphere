import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./Button";

describe("Button", () => {
  it("renders a button with its accessible name", () => {
    render(<Button>Sign in</Button>);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("keeps its own class and adds the one passed in", () => {
    render(<Button className="extra">Go</Button>);
    const button = screen.getByRole("button", { name: "Go" });
    expect(button).toHaveClass("extra");
    expect(button.classList.length).toBeGreaterThan(1);
  });

  it("defaults to the secondary variant", () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute("data-variant", "secondary");
  });

  it.each(["primary", "secondary", "quiet"] as const)("shows the %s variant", (variant) => {
    render(<Button variant={variant}>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute("data-variant", variant);
  });

  it("passes native props and ref to the button", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} type="submit" aria-describedby="hint" id="go">
        Go
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Go" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveAttribute("aria-describedby", "hint");
    expect(button).toHaveAttribute("id", "go");
    expect(ref.current).toBe(button);
  });

  it("defaults to type button", () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" })).toHaveAttribute("type", "button");
  });

  it("calls onClick when not pending", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("stays focusable but ignores clicks while pending", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button pending onClick={onClick}>
        Go
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Go" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("data-pending");
    expect(button).not.toBeDisabled();
    button.focus();
    expect(button).toHaveFocus();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not submit its form while pending", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" pending>
          Go
        </Button>
      </form>,
    );
    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits its form when not pending", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit">Go</Button>
      </form>,
    );
    await user.click(screen.getByRole("button", { name: "Go" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("has no pending attributes when idle", () => {
    render(<Button>Go</Button>);
    const button = screen.getByRole("button", { name: "Go" });
    expect(button).not.toHaveAttribute("aria-disabled");
    expect(button).not.toHaveAttribute("data-pending");
  });
});
