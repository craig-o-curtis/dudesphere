import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { ToggleGroup } from "./ToggleGroup";

function renderGroup() {
  return render(
    <ToggleGroup.Root legend="Theme">
      <ToggleGroup.Item aria-pressed={true}>Light</ToggleGroup.Item>
      <ToggleGroup.Item aria-pressed={false}>Dark</ToggleGroup.Item>
    </ToggleGroup.Root>,
  );
}

describe("ToggleGroup", () => {
  it("is a group named by its legend", () => {
    renderGroup();
    expect(screen.getByRole("group", { name: "Theme" })).toBeInTheDocument();
  });

  it("hides the legend itself, with no span inside it", () => {
    renderGroup();
    const legend = screen.getByText("Theme");
    expect(legend.tagName).toBe("LEGEND");
    expect(legend.classList.length).toBeGreaterThan(0);
    expect(legend.querySelector("*")).toBeNull();
    expect(screen.getByRole("group", { name: "Theme" })).toContainElement(legend);
  });

  it("renders each item as a button with its name", () => {
    renderGroup();
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("button", { name: "Dark" })).toBeInTheDocument();
  });

  it("keeps its own class and adds the one passed in, on root and item", () => {
    render(
      <ToggleGroup.Root legend="Theme" className="extra-root">
        <ToggleGroup.Item className="extra-item">Light</ToggleGroup.Item>
      </ToggleGroup.Root>,
    );
    const group = screen.getByRole("group", { name: "Theme" });
    const item = screen.getByRole("button", { name: "Light" });
    expect(group).toHaveClass("extra-root");
    expect(group.classList.length).toBeGreaterThan(1);
    expect(item).toHaveClass("extra-item");
    expect(item.classList.length).toBeGreaterThan(1);
  });

  it("passes native props and ref to the root and the item", () => {
    const rootRef = createRef<HTMLFieldSetElement>();
    const itemRef = createRef<HTMLButtonElement>();
    render(
      <ToggleGroup.Root legend="Theme" ref={rootRef} data-theme-group="x">
        <ToggleGroup.Item ref={itemRef} id="light" data-extra="y">
          Light
        </ToggleGroup.Item>
      </ToggleGroup.Root>,
    );
    const group = screen.getByRole("group", { name: "Theme" });
    const item = screen.getByRole("button", { name: "Light" });
    expect(group).toHaveAttribute("data-theme-group", "x");
    expect(rootRef.current).toBe(group);
    expect(item).toHaveAttribute("id", "light");
    expect(item).toHaveAttribute("data-extra", "y");
    expect(itemRef.current).toBe(item);
  });

  it("reads the pressed state from aria-pressed", () => {
    renderGroup();
    const light = screen.getByRole("button", { name: "Light" });
    const dark = screen.getByRole("button", { name: "Dark" });
    expect(light).toHaveAttribute("aria-pressed", "true");
    expect(light).toHaveAttribute("data-pressed", "true");
    expect(dark).toHaveAttribute("aria-pressed", "false");
    expect(dark).not.toHaveAttribute("data-pressed");
  });

  it("passes aria-disabled and aria-describedby through", () => {
    render(
      <ToggleGroup.Root legend="Theme">
        <ToggleGroup.Item aria-disabled aria-describedby="hint">
          Light
        </ToggleGroup.Item>
      </ToggleGroup.Root>,
    );
    const item = screen.getByRole("button", { name: "Light" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    expect(item).toHaveAttribute("aria-describedby", "hint");
  });

  it("calls onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ToggleGroup.Root legend="Theme">
        <ToggleGroup.Item onClick={onClick}>Light</ToggleGroup.Item>
      </ToggleGroup.Root>,
    );
    await user.click(screen.getByRole("button", { name: "Light" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("makes every item a Tab stop and adds no arrow-key handling", async () => {
    const user = userEvent.setup();
    renderGroup();
    const light = screen.getByRole("button", { name: "Light" });
    const dark = screen.getByRole("button", { name: "Dark" });
    expect(light).not.toHaveAttribute("tabindex");
    expect(dark).not.toHaveAttribute("tabindex");
    light.focus();
    await user.keyboard("{ArrowRight}");
    expect(light).toHaveFocus();
  });
});
